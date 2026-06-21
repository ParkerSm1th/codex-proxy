import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { encryptJson, generateProxyApiKey, hashApiKey } from "../src/crypto";
import type { CodexTokenBundle } from "../src/types";

interface Options {
  authFile: string;
  email: string;
  displayName: string | null;
  label: string;
  database: string;
  remote: boolean;
  dryRun: boolean;
}

const options = parseArgs(process.argv.slice(2));
const tokenEncryptionKey = process.env.TOKEN_ENCRYPTION_KEY;
const apiKeyPepper = process.env.API_KEY_PEPPER;

if (!tokenEncryptionKey || !apiKeyPepper) {
  fail("TOKEN_ENCRYPTION_KEY and API_KEY_PEPPER must be set in the environment.");
}

const rawAuth = JSON.parse(await readFile(resolvePath(options.authFile), "utf8")) as Record<string, unknown>;
const bundle = normalizeTokenBundle(rawAuth);
const proxyApiKey = generateProxyApiKey();
const keyHash = await hashApiKey(proxyApiKey, apiKeyPepper);
const encryptedBundle = await encryptJson(bundle, tokenEncryptionKey);
const chatgptAccountId = getString(rawAuth.chatgpt_account_id) ?? getString(bundle.chatgpt_account_id);
const userId = crypto.randomUUID();
const keyId = crypto.randomUUID();
const keyPrefix = proxyApiKey.slice(4, 12);
const sqlText = buildSql({
  userId,
  email: options.email,
  displayName: options.displayName,
  keyHash,
  keyLabel: options.label,
  keyId,
  keyPrefix,
  encryptedBundle,
  chatgptAccountId
});

if (options.dryRun) {
  console.log("Dry run only. No D1 changes were applied.");
  console.log("SQL preview with encrypted token material redacted:");
  console.log(sqlText.replaceAll(encryptedBundle, "[encrypted-token-bundle]"));
  console.log(`Generated proxy API key: ${proxyApiKey}`);
  process.exit(0);
}

await executeWranglerSql(options.database, sqlText, options.remote);

console.log("Provisioned UseMySub user.");
console.log(`Email: ${options.email}`);
console.log(`Database: ${options.database} (${options.remote ? "remote" : "local"})`);
console.log("Store this proxy API key now; only its hash was persisted:");
console.log(proxyApiKey);
console.log("The user can sign in at /login with a magic link sent to this email.");

function normalizeTokenBundle(auth: Record<string, unknown>): CodexTokenBundle {
  const candidate = isRecord(auth.tokens) ? auth.tokens : isRecord(auth.token) ? auth.token : auth;
  const accessToken = getString(candidate.access_token) ?? getString(candidate.accessToken);
  const refreshToken = getString(candidate.refresh_token) ?? getString(candidate.refreshToken);

  if (!accessToken || !refreshToken) {
    fail("Could not find access_token and refresh_token in the Codex auth file.");
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

function normalizeExpiresAt(value: unknown): number | undefined {
  if (typeof value === "number") {
    return value > 10_000_000_000 ? Math.floor(value / 1000) : value;
  }

  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return normalizeExpiresAt(numeric);
    }

    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return Math.floor(parsed / 1000);
    }
  }

  return undefined;
}

function buildSql(input: {
  userId: string;
  email: string;
  displayName: string | null;
  keyHash: string;
  keyLabel: string;
  keyId: string;
  keyPrefix: string;
  encryptedBundle: string;
  chatgptAccountId: string | null;
}): string {
  return `
INSERT INTO users (id, email, display_name, password_hash, password_salt, status)
VALUES (${sqlValue(input.userId)}, ${sqlValue(input.email)}, ${sqlValue(input.displayName)}, NULL, NULL, 'active')
ON CONFLICT(email) DO UPDATE SET
  display_name = COALESCE(excluded.display_name, users.display_name),
  status = 'active';

INSERT INTO api_keys (id, key_hash, user_id, label, key_prefix)
VALUES (${sqlValue(input.keyId)}, ${sqlValue(input.keyHash)}, (SELECT id FROM users WHERE email = ${sqlValue(input.email)}), ${sqlValue(input.keyLabel)}, ${sqlValue(input.keyPrefix)})
ON CONFLICT(key_hash) DO UPDATE SET
  label = excluded.label,
  key_prefix = excluded.key_prefix,
  disabled_at = NULL;

INSERT INTO codex_tokens (user_id, encrypted_token_bundle, chatgpt_account_id, last_refresh)
VALUES (
  (SELECT id FROM users WHERE email = ${sqlValue(input.email)}),
  ${sqlValue(input.encryptedBundle)},
  ${sqlValue(input.chatgptAccountId)},
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(user_id) DO UPDATE SET
  encrypted_token_bundle = excluded.encrypted_token_bundle,
  chatgpt_account_id = excluded.chatgpt_account_id,
  token_version = codex_tokens.token_version + 1,
  reauth_required_at = NULL,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
`.trimStart();
}

async function executeWranglerSql(database: string, sqlText: string, remote: boolean): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "codex-proxy-"));
  const file = join(directory, "provision.sql");

  try {
    await writeFile(file, sqlText, { mode: 0o600 });
    await run("npx", ["wrangler", "d1", "execute", database, remote ? "--remote" : "--local", "--file", file]);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolveRun();
      } else {
        reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
      }
    });
  });
}

function parseArgs(args: string[]): Options {
  const values = new Map<string, string | boolean>();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg?.startsWith("--")) {
      continue;
    }

    const key = arg.slice(2);
    if (key === "remote" || key === "dry-run") {
      values.set(key, true);
      continue;
    }

    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      fail(`Missing value for --${key}`);
    }
    values.set(key, value);
    index += 1;
  }

  const email = stringArg(values, "email");
  if (!email) {
    fail("Usage: npm run provision -- --email user@example.com [--auth-file ~/.codex/auth.json] [--remote]");
  }

  return {
    authFile: stringArg(values, "auth-file") ?? "~/.codex/auth.json",
    email,
    displayName: stringArg(values, "display-name"),
    label: stringArg(values, "label") ?? "default",
    database: stringArg(values, "database") ?? "codex-proxy-db",
    remote: values.get("remote") === true,
    dryRun: values.get("dry-run") === true
  };
}

function stringArg(values: Map<string, string | boolean>, key: string): string | null {
  const value = values.get(key);
  return typeof value === "string" ? value : null;
}

function resolvePath(path: string): string {
  return path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
}

function sqlValue(value: string | null): string {
  if (value === null) {
    return "NULL";
  }

  return `'${value.replaceAll("'", "''")}'`;
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
