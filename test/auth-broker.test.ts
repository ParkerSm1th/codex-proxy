import { afterEach, describe, expect, it, vi } from "vitest";
import { TokenBroker, isAccessTokenFresh } from "../src/auth-broker";
import { bytesToBase64Url, encryptJson } from "../src/crypto";
import type { RuntimeEnv } from "../src/env";

const tokenSecret = bytesToBase64Url(new Uint8Array(Array.from({ length: 32 }, (_, index) => index + 40)));

describe("TokenBroker", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("recognizes fresh access tokens", () => {
    expect(
      isAccessTokenFresh({
        access_token: "access",
        refresh_token: "refresh",
        expires_at: Math.floor(Date.now() / 1000) + 600
      })
    ).toBe(true);
  });

  it("serializes concurrent refreshes for one Durable Object instance", async () => {
    const encrypted = await encryptJson(
      {
        access_token: "old-access",
        refresh_token: "old-refresh",
        expires_at: Math.floor(Date.now() / 1000) - 60
      },
      tokenSecret
    );
    const refreshFetch = vi.fn(async () =>
      Response.json({
        access_token: "new-access",
        refresh_token: "new-refresh",
        expires_in: 3600,
        chatgpt_account_id: "account-1"
      })
    );
    vi.stubGlobal("fetch", refreshFetch);

    const updates: unknown[][] = [];
    const userId = "user-1";
    const broker = new TokenBroker(mockBrokerCtx(userId), createEnv(encrypted, updates, userId));

    const [first, second] = await Promise.all([
      broker.getAccessToken(userId, true),
      broker.getAccessToken(userId, true)
    ]);

    expect(first.accessToken).toBe("new-access");
    expect(second.accessToken).toBe("new-access");
    expect(refreshFetch).toHaveBeenCalledTimes(1);
    expect(updates).toHaveLength(1);
  });
});

function createEnv(encrypted: string, updates: unknown[][], userId: string): RuntimeEnv {
  return {
    API_KEY_PEPPER: "pepper",
    TOKEN_ENCRYPTION_KEY: tokenSecret,
    CODEX_OAUTH_TOKEN_URL: "https://auth.example/oauth/token",
    CODEX_OAUTH_CLIENT_ID: "client",
    DB: {
      prepare(sql: string) {
        return {
          bind(...args: unknown[]) {
            return {
              async first() {
                if (sql.includes("FROM codex_tokens")) {
                  return {
                    encrypted_token_bundle: encrypted,
                    chatgpt_account_id: "account-1"
                  };
                }
                return null;
              },
              async run() {
                if (sql.includes("UPDATE codex_tokens")) {
                  updates.push(args);
                }
                return { success: true };
              }
            };
          }
        };
      }
    },
    TOKEN_BROKER: {
      idFromName: (name: string) => mockDurableObjectId(name),
      getByName: () => {
        throw new Error("not used");
      }
    }
  } as unknown as RuntimeEnv;
}

function mockBrokerCtx(userId: string): DurableObjectState {
  return { id: mockDurableObjectId(userId) } as DurableObjectState;
}

function mockDurableObjectId(value: string): DurableObjectId {
  return {
    toString: () => value,
    equals: (other: DurableObjectId) => other.toString() === value
  } as DurableObjectId;
}
