import {
  CODEX_ORIGINATOR,
  DEFAULT_CODEX_OAUTH_CLIENT_ID,
  DEFAULT_CODEX_OAUTH_TOKEN_URL
} from "../constants";
import type { RuntimeEnv } from "../env";
import { DashboardError, linkCodexAuth } from "./service";
import type { DashboardUser } from "./session";

const DEFAULT_ISSUER = "https://auth.openai.com";
const DEFAULT_REDIRECT_URI = "http://localhost:1455/auth/callback";
const SESSION_TTL_MS = 15 * 60 * 1000;

export interface CodexOAuthStartResult {
  authUrl: string;
  redirectUri: string;
}

export async function startCodexOAuth(env: RuntimeEnv, userId: string): Promise<CodexOAuthStartResult> {
  const { codeVerifier, codeChallenge } = await generatePkce();
  const state = generateState();
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  await env.DB.prepare("DELETE FROM codex_oauth_sessions WHERE user_id = ? AND used_at IS NULL")
    .bind(userId)
    .run();

  await env.DB.prepare(
    `INSERT INTO codex_oauth_sessions (id, user_id, state, code_verifier, redirect_uri, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(sessionId, userId, state, codeVerifier, DEFAULT_REDIRECT_URI, expiresAt)
    .run();

  const authUrl = buildAuthorizeUrl(env, {
    redirectUri: DEFAULT_REDIRECT_URI,
    codeChallenge,
    state
  });

  return { authUrl, redirectUri: DEFAULT_REDIRECT_URI };
}

export async function completeCodexOAuth(
  env: RuntimeEnv,
  user: DashboardUser,
  callbackInput: string
): Promise<void> {
  const callbackUrl = parseCallbackUrl(callbackInput);
  if (callbackUrl.pathname !== "/auth/callback") {
    throw new DashboardError(400, "Paste the full localhost redirect URL from your browser");
  }

  const code = callbackUrl.searchParams.get("code")?.trim();
  const state = callbackUrl.searchParams.get("state")?.trim();
  if (!code || !state) {
    throw new DashboardError(400, "Redirect URL is missing code or state");
  }

  const session = await env.DB.prepare(
    `SELECT id, code_verifier, redirect_uri
       FROM codex_oauth_sessions
      WHERE user_id = ?
        AND state = ?
        AND used_at IS NULL
        AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      LIMIT 1`
  )
    .bind(user.id, state)
    .first<{ id: string; code_verifier: string; redirect_uri: string }>();

  if (!session) {
    throw new DashboardError(400, "OAuth session expired or does not match. Start sign-in again.");
  }

  const tokens = await exchangeCodeForTokens(env, {
    code,
    codeVerifier: session.code_verifier,
    redirectUri: session.redirect_uri
  });

  const chatgptAccountId = extractChatgptAccountId(tokens.id_token);
  const authJson: Record<string, unknown> = {
    auth_mode: "chatgpt",
    chatgpt_account_id: chatgptAccountId,
    last_refresh: new Date().toISOString(),
    tokens: {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      id_token: tokens.id_token
    }
  };

  await linkCodexAuth(env, user, authJson);

  const usedAt = new Date().toISOString();
  await env.DB.prepare("UPDATE codex_oauth_sessions SET used_at = ? WHERE id = ?").bind(usedAt, session.id).run();
}

function buildAuthorizeUrl(
  env: RuntimeEnv,
  input: { redirectUri: string; codeChallenge: string; state: string }
): string {
  const issuer = DEFAULT_ISSUER;
  const clientId = env.CODEX_OAUTH_CLIENT_ID ?? DEFAULT_CODEX_OAUTH_CLIENT_ID;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: input.redirectUri,
    scope: "openid profile email offline_access",
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
    id_token_add_organizations: "true",
    codex_cli_simplified_flow: "true",
    state: input.state,
    originator: CODEX_ORIGINATOR
  });

  return `${issuer}/oauth/authorize?${params.toString()}`;
}

async function exchangeCodeForTokens(
  env: RuntimeEnv,
  input: { code: string; codeVerifier: string; redirectUri: string }
): Promise<{ id_token: string; access_token: string; refresh_token: string }> {
  const tokenUrl = env.CODEX_OAUTH_TOKEN_URL ?? DEFAULT_CODEX_OAUTH_TOKEN_URL;
  const clientId = env.CODEX_OAUTH_CLIENT_ID ?? DEFAULT_CODEX_OAUTH_CLIENT_ID;

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: clientId,
    code_verifier: input.codeVerifier
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json"
    },
    body
  });

  if (!response.ok) {
    throw new DashboardError(400, "Codex sign-in failed. Start again and paste the newest redirect URL.");
  }

  const tokens = (await response.json()) as {
    id_token?: string;
    access_token?: string;
    refresh_token?: string;
  };

  if (!tokens.id_token || !tokens.access_token || !tokens.refresh_token) {
    throw new DashboardError(400, "Codex sign-in response was incomplete");
  }

  return {
    id_token: tokens.id_token,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token
  };
}

export function parseCallbackUrl(input: string): URL {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new DashboardError(400, "Redirect URL is required");
  }

  try {
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return new URL(trimmed);
    }

    if (trimmed.startsWith("/")) {
      return new URL(trimmed, "http://localhost:1455");
    }

    return new URL(`http://localhost:1455/${trimmed.replace(/^\//, "")}`);
  } catch {
    throw new DashboardError(400, "Could not parse redirect URL");
  }
}

function extractChatgptAccountId(idToken: string): string | null {
  const payload = decodeJwtPayload(idToken);
  const auth = payload["https://api.openai.com/auth"];
  if (typeof auth !== "object" || auth === null || Array.isArray(auth)) {
    return null;
  }

  const accountId = (auth as Record<string, unknown>).chatgpt_account_id;
  return typeof accountId === "string" && accountId.length > 0 ? accountId : null;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length < 2) {
    return {};
  }

  const payload = parts[1];
  if (!payload) {
    return {};
  }

  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  try {
    const json = atob(padded);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function generatePkce(): Promise<{ codeVerifier: string; codeChallenge: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(64));
  const codeVerifier = bytesToBase64Url(bytes);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
  const codeChallenge = bytesToBase64Url(new Uint8Array(digest));
  return { codeVerifier, codeChallenge };
}

function generateState(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}
