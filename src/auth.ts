import { hashApiKey } from "./crypto";
import type { RuntimeEnv } from "./env";
import type { AuthenticatedUser } from "./types";

interface AuthRow {
  id: string;
  email: string;
  display_name: string | null;
  chatgpt_account_id: string | null;
  api_key_id: string | null;
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

export async function authenticateRequest(request: Request, env: RuntimeEnv, ctx?: ExecutionContext): Promise<AuthResult> {
  const apiKey = extractBearerToken(request.headers.get("authorization"));
  if (!apiKey) {
    throw new HttpError(401, "Missing bearer proxy API key", "authentication_error", "missing_api_key");
  }

  if (!env.API_KEY_PEPPER) {
    throw new HttpError(500, "API key pepper is not configured", "server_error", "missing_secret");
  }

  const keyHash = await hashApiKey(apiKey, env.API_KEY_PEPPER);
  const row = await env.DB.prepare(
    `SELECT users.id, users.email, users.display_name, codex_tokens.chatgpt_account_id, api_keys.id AS api_key_id
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

  if (!row) {
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
    return jsonError(error.message, error.status, error.type, error.code);
  }

  if (error instanceof Error && error.name === "MissingMessagesError") {
    return jsonError(error.message, 400, "invalid_request_error", "missing_messages");
  }

  const message = error instanceof Error ? error.message : "Unexpected server error";
  return jsonError(message, 500, "server_error");
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
