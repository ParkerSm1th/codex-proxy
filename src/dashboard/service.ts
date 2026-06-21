import { encryptJson, generateProxyApiKey, hashApiKey } from "../crypto";
import type { RuntimeEnv } from "../env";
import type { CodexTokenBundle } from "../types";
import { hashPassword, PasswordPolicyError, validatePasswordPolicy, verifyPassword } from "./password";
import type { DashboardUser } from "./session";

const GENERIC_AUTH_ERROR = "Invalid email or password";
const MAX_TOKEN_FIELD_LENGTH = 8192;

export async function registerUser(
  env: RuntimeEnv,
  input: { email: string; password: string; displayName?: string | null }
): Promise<{ userId: string }> {
  if (env.ENABLE_PUBLIC_REGISTER !== "true") {
    throw new DashboardError(403, "Registration is disabled");
  }

  validatePasswordPolicy(input.password);

  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ? LIMIT 1").bind(input.email).first();
  if (existing) {
    throw new DashboardError(401, GENERIC_AUTH_ERROR);
  }

  const { hash, salt } = await hashPassword(input.password);
  const userId = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO users (id, email, display_name, password_hash, password_salt, status)
     VALUES (?, ?, ?, ?, ?, 'active')`
  )
    .bind(userId, input.email, input.displayName ?? null, hash, salt)
    .run();

  return { userId };
}

export async function loginUser(
  env: RuntimeEnv,
  input: { email: string; password: string }
): Promise<{ userId: string }> {
  const row = await env.DB.prepare(
    "SELECT id, password_hash, password_salt, status FROM users WHERE email = ? LIMIT 1"
  )
    .bind(input.email)
    .first<{ id: string; password_hash: string | null; password_salt: string | null; status: string }>();

  if (!row || row.status !== "active" || !row.password_hash || !row.password_salt) {
    throw new DashboardError(401, GENERIC_AUTH_ERROR);
  }

  const valid = await verifyPassword(input.password, row.password_hash, row.password_salt);
  if (!valid) {
    throw new DashboardError(401, GENERIC_AUTH_ERROR);
  }

  return { userId: row.id };
}

export async function listApiKeys(env: RuntimeEnv, userId: string) {
  const result = await env.DB.prepare(
    `SELECT id, label, key_prefix, created_at, last_used_at, disabled_at
       FROM api_keys
      WHERE user_id = ?
      ORDER BY created_at DESC`
  )
    .bind(userId)
    .all<{
      id: string;
      label: string;
      key_prefix: string | null;
      created_at: string;
      last_used_at: string | null;
      disabled_at: string | null;
    }>();

  return (result.results ?? []).map((row) => ({
    id: row.id,
    label: row.label,
    prefix: row.key_prefix ? `cpk_${row.key_prefix}…` : "cpk_…",
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    disabled: row.disabled_at != null
  }));
}

export async function createApiKey(
  env: RuntimeEnv,
  userId: string,
  label: string
): Promise<{ apiKey: string; id: string; prefix: string }> {
  const proxyApiKey = generateProxyApiKey();
  const keyHash = await hashApiKey(proxyApiKey, env.API_KEY_PEPPER);
  const id = crypto.randomUUID();
  const keyPrefix = proxyApiKey.slice(4, 12);

  await env.DB.prepare(
    `INSERT INTO api_keys (id, key_hash, user_id, label, key_prefix)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(id, keyHash, userId, label, keyPrefix)
    .run();

  return { apiKey: proxyApiKey, id, prefix: `cpk_${keyPrefix}…` };
}

export async function revokeApiKey(env: RuntimeEnv, userId: string, keyId: string): Promise<void> {
  const result = await env.DB.prepare(
    `UPDATE api_keys
        SET disabled_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ? AND user_id = ? AND disabled_at IS NULL`
  )
    .bind(keyId, userId)
    .run();

  if ((result.meta?.changes ?? 0) === 0) {
    throw new DashboardError(404, "API key not found");
  }
}

export async function linkCodexAuth(
  env: RuntimeEnv,
  user: DashboardUser,
  authJson: Record<string, unknown>
): Promise<void> {
  validateCodexAuthJson(authJson);
  const bundle = normalizeTokenBundle(authJson);
  const encryptedBundle = await encryptJson(bundle, env.TOKEN_ENCRYPTION_KEY);
  const chatgptAccountId = extractAccountId(authJson, bundle);
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO codex_tokens (user_id, encrypted_token_bundle, chatgpt_account_id, last_refresh, reauth_required_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       encrypted_token_bundle = excluded.encrypted_token_bundle,
       chatgpt_account_id = excluded.chatgpt_account_id,
       last_refresh = excluded.last_refresh,
       token_version = codex_tokens.token_version + 1,
       reauth_required_at = NULL,
       updated_at = excluded.updated_at`
  )
    .bind(user.id, encryptedBundle, chatgptAccountId, now, now)
    .run();
}

export async function getCodexStatus(env: RuntimeEnv, userId: string) {
  const row = await env.DB.prepare(
    `SELECT chatgpt_account_id, last_refresh, reauth_required_at, updated_at, token_version
       FROM codex_tokens
      WHERE user_id = ?
      LIMIT 1`
  )
    .bind(userId)
    .first<{
      chatgpt_account_id: string | null;
      last_refresh: string | null;
      reauth_required_at: string | null;
      updated_at: string;
      token_version: number;
    }>();

  if (!row) {
    return { linked: false as const };
  }

  return {
    linked: true as const,
    chatgptAccountId: row.chatgpt_account_id,
    lastRefresh: row.last_refresh,
    reauthRequired: row.reauth_required_at != null,
    updatedAt: row.updated_at,
    tokenVersion: row.token_version
  };
}

export class DashboardError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "DashboardError";
  }
}

export function validateCodexAuthJson(auth: Record<string, unknown>): void {
  if (!isRecord(auth)) {
    throw new DashboardError(400, "auth JSON must be an object");
  }

  const depth = maxObjectDepth(auth, 4);
  if (depth > 4) {
    throw new DashboardError(400, "auth JSON is too deeply nested");
  }

  const candidate = isRecord(auth.tokens) ? auth.tokens : isRecord(auth.token) ? auth.token : auth;
  if (!isRecord(candidate)) {
    throw new DashboardError(400, "auth JSON must include token fields");
  }

  const accessToken = getString(candidate.access_token) ?? getString(candidate.accessToken);
  const refreshToken = getString(candidate.refresh_token) ?? getString(candidate.refreshToken);

  if (!accessToken || !refreshToken) {
    throw new DashboardError(400, "Could not find access_token and refresh_token in auth JSON");
  }

  if (accessToken.length > MAX_TOKEN_FIELD_LENGTH || refreshToken.length > MAX_TOKEN_FIELD_LENGTH) {
    throw new DashboardError(400, "Token fields exceed maximum allowed length");
  }
}

function normalizeTokenBundle(auth: Record<string, unknown>): CodexTokenBundle {
  const candidate = isRecord(auth.tokens) ? auth.tokens : isRecord(auth.token) ? auth.token : auth;
  const accessToken = getString(candidate.access_token) ?? getString(candidate.accessToken);
  const refreshToken = getString(candidate.refresh_token) ?? getString(candidate.refreshToken);

  if (!accessToken || !refreshToken) {
    throw new DashboardError(400, "Could not find access_token and refresh_token in auth JSON");
  }

  const bundle: CodexTokenBundle = {
    ...candidate,
    access_token: accessToken,
    refresh_token: refreshToken
  };

  const expiresAt = normalizeExpiresAt(candidate.expires_at ?? candidate.expiresAt);
  if (expiresAt) {
    bundle.expires_at = expiresAt;
  }

  return bundle;
}

function extractAccountId(auth: Record<string, unknown>, bundle: CodexTokenBundle): string | null {
  return getString(auth.chatgpt_account_id) ?? getString(bundle.chatgpt_account_id) ?? getString(bundle.account_id);
}

function normalizeExpiresAt(value: unknown): number | undefined {
  if (typeof value === "number") {
    return value > 10_000_000_000 ? Math.floor(value / 1000) : value;
  }

  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return normalizeExpiresAt(numeric);
    }
  }

  return undefined;
}

function maxObjectDepth(value: unknown, maxDepth: number, depth = 0): number {
  if (!isRecord(value) || depth >= maxDepth) {
    return depth;
  }

  let deepest = depth;
  for (const child of Object.values(value)) {
    deepest = Math.max(deepest, maxObjectDepth(child, maxDepth, depth + 1));
  }
  return deepest;
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
