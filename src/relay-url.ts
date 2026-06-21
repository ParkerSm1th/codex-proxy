import type { RuntimeEnv } from "./env";

const ALLOWED_RELAY_HOST_SUFFIXES = [".workers.dev", ".fly.dev"];

export function resolveCodexRelayUrl(env: RuntimeEnv): string | null {
  const relayUrl = env.CODEX_RELAY_URL?.trim();
  if (!relayUrl) {
    return null;
  }

  if (env.ENABLE_EXTERNAL_RELAY !== "true") {
    console.error(
      JSON.stringify({
        level: "error",
        event: "codex_relay_url_rejected",
        reason: "ENABLE_EXTERNAL_RELAY is not true"
      })
    );
    return null;
  }

  try {
    const parsed = new URL(relayUrl);
    if (parsed.protocol !== "https:") {
      console.error(
        JSON.stringify({
          level: "error",
          event: "codex_relay_url_rejected",
          reason: "relay URL must use https"
        })
      );
      return null;
    }

    const hostAllowed =
      ALLOWED_RELAY_HOST_SUFFIXES.some((suffix) => parsed.hostname.endsWith(suffix)) ||
      parsed.hostname === "localhost";

    if (!hostAllowed) {
      console.error(
        JSON.stringify({
          level: "error",
          event: "codex_relay_url_rejected",
          reason: "relay host not in allowlist",
          host: parsed.hostname
        })
      );
      return null;
    }

    return relayUrl;
  } catch {
    console.error(
      JSON.stringify({
        level: "error",
        event: "codex_relay_url_rejected",
        reason: "invalid URL"
      })
    );
    return null;
  }
}
