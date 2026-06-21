import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/app";
import { bytesToBase64Url, encryptJson, hashApiKey } from "../src/crypto";
import type { RuntimeEnv } from "../src/env";

const tokenSecret = bytesToBase64Url(new Uint8Array(Array.from({ length: 32 }, (_, index) => index + 10)));

describe("Worker routes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requires a valid proxy key for /v1/models", async () => {
    const env = await createEnv("cpk_test");
    const response = await worker.fetch(new Request("https://proxy.example/v1/models"), env, ctx());

    expect(response.status).toBe(401);
  });

  it("returns OpenAI-compatible models after proxy auth", async () => {
    const apiKey = "cpk_test";
    const env = await createEnv(apiKey);
    const response = await worker.fetch(
      new Request("https://proxy.example/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` }
      }),
      env,
      ctx()
    );

    await expect(response.json()).resolves.toMatchObject({
      object: "list",
      data: expect.arrayContaining([expect.objectContaining({ id: "gpt-5.5" })])
    });
  });

  it("proxies chat completions through Codex and transforms the stream", async () => {
    const apiKey = "cpk_test";
    const env = await createEnv(apiKey);
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({
        model: "gpt-5.5",
        stream: true,
        store: false
      });

      return new Response(
        streamFromString(
          [
            'data: {"type":"response.output_text.delta","delta":"Hello"}',
            "",
            'data: {"type":"response.completed"}',
            "",
            ""
          ].join("\n")
        ),
        { status: 200, headers: { "Content-Type": "text/event-stream" } }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request("https://proxy.example/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-5.5",
          messages: [{ role: "user", content: "Say hello" }]
        })
      }),
      env,
      ctx()
    );

    const text = await response.text();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(text).toContain('"content":"Hello"');
    expect(text).toContain("data: [DONE]");
    expect(response.headers.get("X-Request-Id")).toBeTruthy();
  });

  it("accepts Cursor responses payloads on /v1/chat/completions", async () => {
    const apiKey = "cpk_test";
    const env = await createEnv(apiKey);
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({
        model: "gpt-5.5",
        stream: true,
        store: false,
        input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] }]
      });

      return new Response(
        streamFromString(
          [
            'data: {"type":"response.output_text.delta","delta":"Hello"}',
            "",
            'data: {"type":"response.completed"}',
            "",
            ""
          ].join("\n")
        ),
        { status: 200, headers: { "Content-Type": "text/event-stream" } }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request("https://proxy.example/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-5.5",
          input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] }],
          stream: true,
          include: ["reasoning.encrypted_content"]
        })
      }),
      env,
      ctx()
    );

    const text = await response.text();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(text).toContain('"content":"Hello"');
  });

  it("returns 400 when chat completions is missing messages and input", async () => {
    const apiKey = "cpk_test";
    const env = await createEnv(apiKey);

    const response = await worker.fetch(
      new Request("https://proxy.example/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ model: "gpt-5.5" })
      }),
      env,
      ctx()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "missing_messages" }
    });
  });
});

async function createEnv(apiKey: string): Promise<RuntimeEnv> {
  const keyHash = await hashApiKey(apiKey, "pepper");
  const encrypted = await encryptJson(
    {
      access_token: "codex-access",
      refresh_token: "codex-refresh",
      expires_at: Math.floor(Date.now() / 1000) + 3600
    },
    tokenSecret
  );

  return {
    API_KEY_PEPPER: "pepper",
    TOKEN_ENCRYPTION_KEY: tokenSecret,
    CODEX_UPSTREAM_URL: "https://codex.example/responses",
    CODEX_OAUTH_TOKEN_URL: "https://auth.example/oauth/token",
    CODEX_OAUTH_CLIENT_ID: "client",
    DB: fakeD1(keyHash, encrypted),
    TOKEN_BROKER: {
      getByName: () => ({
        getAccessToken: async () => ({
          accessToken: "codex-access",
          chatgptAccountId: "account",
          expiresAt: Math.floor(Date.now() / 1000) + 3600
        })
      })
    }
  } as unknown as RuntimeEnv;
}

function fakeD1(keyHash: string, encrypted: string): D1Database {
  return {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first() {
              if (sql.includes("SELECT users.id") && args[0] === keyHash) {
                return {
                  id: "user-1",
                  email: "user@example.com",
                  display_name: "User",
                  chatgpt_account_id: "account"
                };
              }

              if (sql.includes("FROM codex_tokens")) {
                return {
                  encrypted_token_bundle: encrypted,
                  chatgpt_account_id: "account"
                };
              }

              return null;
            },
            async run() {
              return { success: true };
            }
          };
        }
      };
    }
  } as unknown as D1Database;
}

function ctx(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn()
  } as unknown as ExecutionContext;
}

function streamFromString(value: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(value));
      controller.close();
    }
  });
}
