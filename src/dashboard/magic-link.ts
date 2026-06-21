import { hashApiKey } from "../crypto";
import type { RuntimeEnv } from "../env";
import { sendMagicLinkEmail } from "./email";
import { DashboardError } from "./service";

const TOKEN_TTL_MS = 15 * 60 * 1000;
const GENERIC_MAGIC_LINK_MESSAGE = "If an account exists for that email, a sign-in link is on its way.";

function publicOrigin(env: RuntimeEnv, request: Request): string {
  return env.PUBLIC_APP_ORIGIN?.trim() || new URL(request.url).origin;
}

async function hashLoginToken(token: string, pepper: string): Promise<string> {
  return hashApiKey(token, `${pepper}:login-token`);
}

export async function getOrCreateUserByEmail(
  env: RuntimeEnv,
  email: string
): Promise<{ userId: string; created: boolean }> {
  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ? LIMIT 1")
    .bind(email)
    .first<{ id: string }>();

  if (existing) {
    return { userId: existing.id, created: false };
  }

  const userId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO users (id, email, display_name, password_hash, password_salt, status)
     VALUES (?, ?, NULL, NULL, NULL, 'active')`
  )
    .bind(userId, email)
    .run();

  return { userId, created: true };
}

export async function requestMagicLink(
  env: RuntimeEnv,
  request: Request,
  email: string
): Promise<{ message: string; devLink?: string }> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) {
    throw new DashboardError(400, "A valid email address is required");
  }

  const { userId } = await getOrCreateUserByEmail(env, normalized);
  const rawToken = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const tokenHash = await hashLoginToken(rawToken, env.API_KEY_PEPPER);
  const tokenId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  await env.DB.prepare(
    `INSERT INTO login_tokens (id, user_id, token_hash, expires_at)
     VALUES (?, ?, ?, ?)`
  )
    .bind(tokenId, userId, tokenHash, expiresAt)
    .run();

  const verifyUrl = `${publicOrigin(env, request)}/api/auth/verify?token=${encodeURIComponent(rawToken)}`;

  if (env.DEV_RETURN_MAGIC_LINK === "true") {
    return { message: GENERIC_MAGIC_LINK_MESSAGE, devLink: verifyUrl };
  }

  await sendMagicLinkEmail(env, { to: normalized, verifyUrl });
  return { message: GENERIC_MAGIC_LINK_MESSAGE };
}

export async function verifyMagicLink(
  env: RuntimeEnv,
  token: string
): Promise<{ userId: string }> {
  const trimmed = token.trim();
  if (!trimmed) {
    throw new DashboardError(400, "Invalid or expired sign-in link");
  }

  const tokenHash = await hashLoginToken(trimmed, env.API_KEY_PEPPER);
  const row = await env.DB.prepare(
    `SELECT id, user_id
       FROM login_tokens
      WHERE token_hash = ?
        AND used_at IS NULL
        AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      LIMIT 1`
  )
    .bind(tokenHash)
    .first<{ id: string; user_id: string }>();

  if (!row) {
    throw new DashboardError(400, "Invalid or expired sign-in link");
  }

  const usedAt = new Date().toISOString();
  await env.DB.prepare("UPDATE login_tokens SET used_at = ? WHERE id = ?").bind(usedAt, row.id).run();

  return { userId: row.user_id };
}
