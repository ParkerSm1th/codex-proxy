import { hashApiKey } from "../crypto";
import type { RuntimeEnv } from "../env";

export interface DashboardUser {
  id: string;
  email: string;
  displayName: string | null;
  hasCodexTokens: boolean;
  reauthRequired: boolean;
}

const SESSION_COOKIE = "codex_session";
const SESSION_DAYS = 30;

export async function createSession(env: RuntimeEnv, userId: string): Promise<string> {
  const token = crypto.randomUUID() + crypto.randomUUID();
  const tokenHash = await hashSessionToken(token, env.API_KEY_PEPPER);
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  await env.DB.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at)
     VALUES (?, ?, ?, ?)`
  )
    .bind(sessionId, userId, tokenHash, expiresAt)
    .run();

  return token;
}

export async function deleteSession(env: RuntimeEnv, token: string): Promise<void> {
  const tokenHash = await hashSessionToken(token, env.API_KEY_PEPPER);
  await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
}

export async function getSessionUser(env: RuntimeEnv, request: Request): Promise<DashboardUser | null> {
  const token = getSessionToken(request);
  if (!token) {
    return null;
  }

  const tokenHash = await hashSessionToken(token, env.API_KEY_PEPPER);
  const row = await env.DB.prepare(
    `SELECT users.id, users.email, users.display_name,
            codex_tokens.user_id IS NOT NULL AS has_codex_tokens,
            codex_tokens.reauth_required_at IS NOT NULL AS reauth_required
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       LEFT JOIN codex_tokens ON codex_tokens.user_id = users.id
      WHERE sessions.token_hash = ?
        AND sessions.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        AND users.status = 'active'
      LIMIT 1`
  )
    .bind(tokenHash)
    .first<{
      id: string;
      email: string;
      display_name: string | null;
      has_codex_tokens: number;
      reauth_required: number;
    }>();

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    hasCodexTokens: row.has_codex_tokens === 1,
    reauthRequired: row.reauth_required === 1
  };
}

export function sessionCookie(token: string, request?: Request): string {
  const secure = request ? new URL(request.url).protocol === "https:" : true;
  const securePart = secure ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly${securePart}; SameSite=Lax; Max-Age=${SESSION_DAYS * 24 * 60 * 60}`;
}

export function clearSessionCookie(request?: Request): string {
  const secure = request ? new URL(request.url).protocol === "https:" : true;
  const securePart = secure ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly${securePart}; SameSite=Lax; Max-Age=0`;
}

export function getSessionToken(request: Request): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)codex_session=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

async function hashSessionToken(token: string, pepper: string): Promise<string> {
  return hashApiKey(token, `${pepper}:dashboard-session`);
}
