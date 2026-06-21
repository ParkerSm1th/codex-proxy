# Prior-Art Evaluation

Decision: build greenfield Cloudflare Worker, borrowing protocol behavior from existing local proxies.

Evaluated projects:

- `ephraimduncan/codex-cursor`: TypeScript/Bun local proxy for Cursor. Good evidence for `/v1/models`, `/v1/chat/completions`, model aliases, and tunnel-based Cursor setup. It reads one local `~/.codex/auth.json` and is not a Cloudflare Worker or multi-user service.
- `Firzus/codex-cursor-proxy`: Bun local proxy with named Cloudflare Tunnel support, `/v1/responses`, streaming conversion, usage status, and concurrency controls. It still runs locally, reads local Codex CLI auth, and does not provide D1-backed encrypted per-user token storage.
- `0oAstro/codex-openai-proxy`: Rust proxy with OAuth PKCE/device login, dynamic models, streaming, tool handling, `/v1/responses`, and usage endpoints. It is useful for request-shaping details such as omitting unsupported `tool_choice` objects, but it is not a Cloudflare-native Worker and persists local auth files.
- Related forks and smaller proxies (`wtfsayo/codex-cursor`, `sheikhuzairhussain/codex-cursor-proxy`, `wowyuarm/codex-proxy`, `thkdog/codex-openai-proxy`, `David-Factor/codex-responses-proxy`, `aminmarashi/codex-proxy`) follow the same local-process pattern.

Target requirements that drove the greenfield choice:

- Cloudflare-hosted TypeScript Worker, not a local process plus tunnel.
- Multi-user deployment where each proxy key maps to that user's own Codex subscription credentials.
- Encrypted D1 token storage and hash-only proxy API key storage.
- Per-user Durable Object refresh serialization to protect rotating refresh tokens.
- Minimal teammate setup: deployed `/v1` base URL plus generated proxy API key.
