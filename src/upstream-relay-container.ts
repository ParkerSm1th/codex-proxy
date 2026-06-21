import { Container } from "@cloudflare/containers";
import { DEFAULT_CODEX_UPSTREAM_URL } from "./constants";
import type { RuntimeEnv } from "./env";

export class CodexUpstreamRelay extends Container<RuntimeEnv> {
  override defaultPort = 8790;
  override requiredPorts = [8790];
  override sleepAfter = "30m";
  override enableInternet = true;
  override pingEndpoint = "/health";
  override envVars = {
    CODEX_TARGET_URL: DEFAULT_CODEX_UPSTREAM_URL,
    PORT: "8790"
  };
}
