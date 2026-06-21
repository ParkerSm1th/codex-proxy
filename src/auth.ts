import { hashApiKey, verifyApiKeyHash } from "./crypto";
import type { RuntimeEnv } from "./env";
import { clientIp, checkRateLimit, rateLimitResponse } from "./rate-limit";
import type { AuthenticatedUser } from "./types";

interface AuthRow {
  id: string;
  email: string;
  display_name: string | null;
  chatgpt_account_id: string | null;
  api_key_id: string | null;
  key_hash: string;
}

export interface AuthResult {
  user: AuthenticatedUser;
  keyHash: string;
  apiKeyId: string | null;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly type = "invalid_request_error",
    public readonly code?: string
  ) {
    super(message);
  }
}

const AUTH_FAILURE_LIMIT = 30;
const AUTH_FAILURE_WINDOW_MS = 60_000;
const DUMMY_KEY_HASH = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export async function authenticateRequest(request: Request, env: RuntimeEnv, ctx?: ExecutionContext): Promise<AuthResult> {
  const apiKey = extractBearerToken(request.headers.get("authorization"));
  if (!apiKey) {
    throw new HttpError(401, "Invalid proxy API key", "authentication_error", "invalid_api_key");
  }

  if (!env.API_KEY_PEPPER) {
    throw new HttpError(500, "Internal server error", "server_error");
  }

  const keyHash = await hashApiKey(apiKey, env.API_KEY_PEPPER);
  const row = await env.DB.prepare(
    `SELECT users.id, users.email, users.display_name, codex_tokens.chatgpt_account_id, api_keys.id AS api_key_id, api_keys.key_hash
       FROM api_keys
       JOIN users ON users.id = api_keys.user_id
       LEFT JOIN codex_tokens ON codex_tokens.user_id = users.id
      WHERE api_keys.key_hash = ?
        AND api_keys.disabled_at IS NULL
        AND users.status = 'active'
      LIMIT 1`
  )
    .bind(keyHash)
    .first<AuthRow>();

  const compareHash = row?.key_hash ?? DUMMY_KEY_HASH;
  const valid = await verifyApiKeyHash(apiKey, compareHash, env.API_KEY_PEPPER);

  if (!row || !valid) {
    const rateKey = `v1-auth-fail:${clientIp(request)}`;
    const rate = checkRateLimit(rateKey, AUTH_FAILURE_LIMIT, AUTH_FAILURE_WINDOW_MS);
    if (!rate.allowed) {
      throw new HttpError(429, "Too many requests", "rate_limit_error", "rate_limit_exceeded");
    }
    throw new HttpError(401, "Invalid proxy API key", "authentication_error", "invalid_api_key");
  }

  ctx?.waitUntil(
    env.DB.prepare("UPDATE api_keys SET last_used_at = ? WHERE key_hash = ?")
      .bind(new Date().toISOString(), keyHash)
      .run()
  );

  return {
    keyHash,
    apiKeyId: row.api_key_id,
    user: {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      chatgptAccountId: row.chatgpt_account_id
    }
  };
}

export function extractBearerToken(authorization: string | null): string | null {
  if (!authorization) {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/iu);
  return match?.[1]?.trim() || null;
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    if (error.status === 429) {
      return rateLimitResponse(60);
    }
    return jsonError(error.message, error.status, error.type, error.code);
  }

  if (error instanceof Error && error.name === "MissingMessagesError") {
    return jsonError(error.message, 400, "invalid_request_error", "missing_messages");
  }

  console.error(
    JSON.stringify({
      level: "error",
      event: "request_error",
      error: error instanceof Error ? error.message : "Unexpected server error"
    })
  );
  return jsonError("Internal server error", 500, "server_error");
}

export function jsonError(message: string, status: number, type = "invalid_request_error", code?: string): Response {
  const payload = code
    ? { error: { message, type, code } }
    : { error: { message, type } };

  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}
