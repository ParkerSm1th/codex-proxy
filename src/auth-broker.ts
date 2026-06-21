import { DurableObject } from "cloudflare:workers";
import type { RuntimeEnv } from "./env";
import {
  DEFAULT_CODEX_OAUTH_CLIENT_ID,
  DEFAULT_CODEX_OAUTH_TOKEN_URL,
  TOKEN_REFRESH_SKEW_SECONDS,
  USER_AGENT
} from "./constants";
import { decryptJson, encryptJson } from "./crypto";
import type { BrokerAccessToken, CodexTokenBundle } from "./types";

interface CodexTokenRow {
  encrypted_token_bundle: string;
  chatgpt_account_id: string | null;
}

export class TokenBroker extends DurableObject<RuntimeEnv> {
  private refreshPromise: Promise<BrokerAccessToken> | undefined;

  async getAccessToken(userId: string, forceRefresh = false): Promise<BrokerAccessToken> {
    assertBrokerUserId(this.env, this.ctx.id, userId);

    const current = await this.loadTokenBundle(userId);

    if (!forceRefresh && isAccessTokenFresh(current.bundle)) {
      return {
        accessToken: current.bundle.access_token,
        chatgptAccountId: current.chatgptAccountId,
        expiresAt: current.bundle.expires_at ?? null
      };
    }

    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.refreshAndPersist(userId, current.bundle, current.chatgptAccountId).finally(() => {
      this.refreshPromise = undefined;
    });

    return this.refreshPromise;
  }

  private async loadTokenBundle(userId: string): Promise<{ bundle: CodexTokenBundle; chatgptAccountId: string | null }> {
    const row = await this.env.DB.prepare(
      `SELECT encrypted_token_bundle, chatgpt_account_id
         FROM codex_tokens
        WHERE user_id = ?
          AND reauth_required_at IS NULL
        LIMIT 1`
    )
      .bind(userId)
      .first<CodexTokenRow>();

    if (!row) {
      throw new Error("No active Codex token bundle is provisioned for this user");
    }

    const bundle = await decryptJson<CodexTokenBundle>(row.encrypted_token_bundle, this.env.TOKEN_ENCRYPTION_KEY);
    return {
      bundle,
      chatgptAccountId: extractChatGptAccountId(bundle) ?? row.chatgpt_account_id
    };
  }

  private async refreshAndPersist(
    userId: string,
    bundle: CodexTokenBundle,
    currentAccountId: string | null
  ): Promise<BrokerAccessToken> {
    if (!bundle.refresh_token) {
      await this.markReauthRequired(userId);
      throw new Error("Stored Codex token bundle is missing a refresh token");
    }

    const tokenUrl = this.env.CODEX_OAUTH_TOKEN_URL ?? DEFAULT_CODEX_OAUTH_TOKEN_URL;
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": USER_AGENT
      },
      body: JSON.stringify({
        client_id: this.env.CODEX_OAUTH_CLIENT_ID ?? DEFAULT_CODEX_OAUTH_CLIENT_ID,
        grant_type: "refresh_token",
        refresh_token: bundle.refresh_token
      })
    });

    if (!response.ok) {
      if (response.status === 400 || response.status === 401) {
        await this.markReauthRequired(userId);
      }
      throw new Error(`Codex OAuth refresh failed with status ${response.status}`);
    }

    const refreshed = (await response.json()) as Partial<CodexTokenBundle>;
    if (!refreshed.access_token) {
      throw new Error("Codex OAuth refresh response did not include an access token");
    }

    const nextBundle: CodexTokenBundle = {
      ...bundle,
      ...refreshed,
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token ?? bundle.refresh_token
    };
    const expiresAt = normalizeExpiresAt(refreshed);
    if (expiresAt) {
      nextBundle.expires_at = expiresAt;
    }
    const nextAccountId = extractChatGptAccountId(nextBundle) ?? currentAccountId;
    const encrypted = await encryptJson(nextBundle, this.env.TOKEN_ENCRYPTION_KEY);
    const now = new Date().toISOString();

    await this.env.DB.prepare(
      `UPDATE codex_tokens
          SET encrypted_token_bundle = ?,
              chatgpt_account_id = ?,
              last_refresh = ?,
              token_version = token_version + 1,
              reauth_required_at = NULL,
              updated_at = ?
        WHERE user_id = ?`
    )
      .bind(encrypted, nextAccountId, now, now, userId)
      .run();

    return {
      accessToken: nextBundle.access_token,
      chatgptAccountId: nextAccountId,
      expiresAt: nextBundle.expires_at ?? null
    };
  }

  private async markReauthRequired(userId: string): Promise<void> {
    const now = new Date().toISOString();
    await this.env.DB.prepare(
      "UPDATE codex_tokens SET reauth_required_at = ?, updated_at = ? WHERE user_id = ?"
    )
      .bind(now, now, userId)
      .run();
  }
}

export function assertBrokerUserId(env: RuntimeEnv, durableObjectId: DurableObjectId, userId: string): void {
  const expectedId = env.TOKEN_BROKER.idFromName(userId);
  if (!durableObjectId.equals(expectedId)) {
    throw new Error("userId does not match this token broker instance");
  }
}

export function isAccessTokenFresh(bundle: CodexTokenBundle, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  return Boolean(bundle.access_token && bundle.expires_at && bundle.expires_at - TOKEN_REFRESH_SKEW_SECONDS > nowSeconds);
}

function normalizeExpiresAt(refreshed: Partial<CodexTokenBundle>): number | undefined {
  if (typeof refreshed.expires_at === "number") {
    return refreshed.expires_at;
  }

  if (typeof refreshed.expires_in === "number") {
    return Math.floor(Date.now() / 1000) + refreshed.expires_in;
  }

  return undefined;
}

function extractChatGptAccountId(bundle: CodexTokenBundle): string | null {
  const direct = bundle.chatgpt_account_id ?? bundle.account_id ?? bundle.accountId;
  return typeof direct === "string" && direct.length > 0 ? direct : null;
}
