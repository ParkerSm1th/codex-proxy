# UseMySub

[usemysub.com](https://usemysub.com) — OpenAI-compatible proxy that routes requests through your Codex subscription credentials.

## Prior-Art Decision

Existing projects such as `ephraimduncan/codex-cursor`, `Firzus/codex-cursor-proxy`, and `0oAstro/codex-openai-proxy` are useful prior art for request translation, model aliases, OAuth refresh, and SSE conversion. They are local CLI/server processes, often fronted by tunnels, and read a local `~/.codex/auth.json` for one account. This project is greenfield because the target is Cloudflare-native, multi-user, server-side encrypted token storage with per-user Durable Object refresh serialization.

## Architecture

- `src/index.ts` routes Worker requests.
- `src/openai-compatible.ts` implements `/v1/models`, `/v1/chat/completions`, and `/v1/responses`.
- `src/auth.ts` verifies proxy API keys by HMAC hash only.
- `src/auth-broker.ts` is a per-user Durable Object that serializes OAuth token refresh and persists rotated refresh tokens to D1.
- `src/crypto.ts` uses Web Crypto HMAC-SHA-256 for API key hashes and AES-GCM for encrypted token bundles.
- `src/transform.ts` converts Chat Completions requests to Responses requests and Codex Responses SSE back to Chat Completions SSE.
- `migrations/0001_init.sql` creates `users`, `api_keys`, and `codex_tokens`.

## Setup

Install dependencies and generate Worker binding types:

```bash
npm install
npm run cf-types
```

Create a D1 database and replace the placeholder `database_id` in `wrangler.jsonc`:

```bash
npx wrangler d1 create codex-proxy-db
npx wrangler d1 migrations apply codex-proxy-db --local
```

Set secrets locally in `.dev.vars` and remotely with Wrangler. Use random values; do not reuse examples.

```bash
cp .dev.vars.example .dev.vars
npx wrangler secret put API_KEY_PEPPER
npx wrangler secret put TOKEN_ENCRYPTION_KEY
```

`TOKEN_ENCRYPTION_KEY` must decode to exactly 32 bytes. A base64url value or a 64-character hex value is accepted.

Optional secrets and vars:

- `UPSTREAM_RELAY_TOKEN` — shared secret for the upstream relay (`X-Relay-Token` header). Set on both the Worker and relay container.
- `ENABLE_EXTERNAL_RELAY=true` — required to use `CODEX_RELAY_URL` (external relay hosts must end in `.workers.dev` or `.fly.dev`).
- `RESEND_API_KEY` — Resend API key for magic-link sign-in emails (production).
- `AUTH_FROM_EMAIL` — verified sender, e.g. `UseMySub <auth@usemysub.com>`.
- `PUBLIC_APP_ORIGIN` — base URL for links in emails (defaults to `https://usemysub.com` in production).
- `DEV_RETURN_MAGIC_LINK=true` — local dev only: return the sign-in URL in the API response instead of sending email.

## Provision A User (Codex tokens)

Each teammate must authenticate their own Codex CLI first so they have a local Codex auth file. Then import that file into D1:

```bash
TOKEN_ENCRYPTION_KEY="..." API_KEY_PEPPER="..." \
  npm run provision -- \
  --email teammate@example.com \
  --display-name "Teammate" \
  --auth-file ~/.codex/auth.json
```

Add `--remote` to write to the deployed D1 database. The script prints the proxy API key once; only its HMAC hash is stored.

Users can also sign up at `/login` with any email — a magic link creates the account on first sign-in. After sign-in, `/onboarding` walks through ChatGPT OAuth: open the sign-in link, then paste the `http://localhost:1455/auth/callback?...` redirect URL from your browser.

The CLI provision script remains available for admins who prefer importing `~/.codex/auth.json` directly.

## Dashboard Access

Sign in at `/login` with your email. UseMySub sends a one-time magic link (15 minute expiry). New accounts are created automatically on first sign-in.

## Client setup

Point any OpenAI-compatible client at:

- Base URL: `https://usemysub.com/v1`
- API key: a generated `cpk_...` proxy key from the dashboard
- Model: one listed by `/v1/models`, for example `gpt-5.5` or `gpt-5.5-codex`

Codex is the only supported backend for now.

## Development

```bash
npm test
npm run typecheck
npm run deploy:dry-run
npx wrangler dev
```

The real-account smoke test is disabled by default:

```bash
RUN_CODEX_SMOKE=1 CODEX_PROXY_BASE_URL="https://usemysub.com" CODEX_PROXY_API_KEY="cpk_..." npm test
```

## Deployment Notes

Production is served at **https://usemysub.com** (HTTPS via Cloudflare Universal SSL on the custom domain routes in `wrangler.jsonc`).

Apply migrations remotely before first production use:

```bash
npx wrangler d1 migrations apply codex-proxy-db --remote
npm run deploy
```

The domain must be on your Cloudflare account. Wrangler attaches `usemysub.com` and `www.usemysub.com` as custom domains and provisions DNS + TLS automatically on deploy.

Before team rollout, verify that proxying subscription-backed Codex access for this use case is allowed by the relevant OpenAI/Codex terms. Do not share one user's subscription credentials across the team; each proxy key should map to that user's own Codex account.

## Upstream Relay Security

The container and Fly relay forward Codex traffic. Do not expose a relay publicly without `UPSTREAM_RELAY_TOKEN` authentication. The Worker sends `X-Relay-Token` when the secret is configured.

`CODEX_RELAY_URL` redirects all upstream Codex traffic to an external URL and is only honored when `ENABLE_EXTERNAL_RELAY=true` with an allowlisted host suffix.
