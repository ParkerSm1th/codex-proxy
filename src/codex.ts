import type { RuntimeEnv } from "./env";
import { sanitizeCodexUpstreamBody } from "./request-format";
import { CODEX_ORIGINATOR, DEFAULT_CODEX_UPSTREAM_URL, USER_AGENT } from "./constants";
import { resolveCodexRelayUrl } from "./relay-url";
import type { AuthenticatedUser, BrokerAccessToken, OpenAIError } from "./types";

export interface CodexFetchOptions {
  sessionId?: string;
  signal?: AbortSignal;
  requestId?: string;
}

const UPSTREAM_RELAY_INSTANCE = "default";

export async function fetchCodexResponses(
  env: RuntimeEnv,
  user: AuthenticatedUser,
  body: unknown,
  options: CodexFetchOptions = {}
): Promise<Response> {
  const sanitizedBody = sanitizeCodexUpstreamBody(body);
  const firstToken = await getAccessToken(env, user, false);
  const firstResponse = await postCodex(env, sanitizedBody, user, firstToken, options);

  if (firstResponse.status !== 401) {
    return firstResponse;
  }

  firstResponse.body?.cancel().catch(() => undefined);
  const refreshedToken = await getAccessToken(env, user, true);
  return postCodex(env, sanitizedBody, user, refreshedToken, options);
}

async function getAccessToken(env: RuntimeEnv, user: AuthenticatedUser, forceRefresh: boolean): Promise<BrokerAccessToken> {
  const stub = env.TOKEN_BROKER.getByName(user.id);
  return stub.getAccessToken(user.id, forceRefresh);
}

async function postCodex(
  env: RuntimeEnv,
  body: unknown,
  user: AuthenticatedUser,
  token: BrokerAccessToken,
  options: CodexFetchOptions
): Promise<Response> {
  const headers = new Headers({
    Authorization: `Bearer ${token.accessToken}`,
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    originator: CODEX_ORIGINATOR,
    session_id: options.sessionId ?? crypto.randomUUID(),
    "User-Agent": USER_AGENT
  });
  const accountId = token.chatgptAccountId ?? user.chatgptAccountId;

  if (accountId) {
    headers.set("ChatGPT-Account-Id", accountId);
  }

  applyRelayAuthHeader(env, headers);

  const init: RequestInit = {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  };

  if (options.signal) {
    init.signal = options.signal;
  }

  const relayUrl = resolveCodexRelayUrl(env);
  if (relayUrl) {
    console.log(
      JSON.stringify({
        level: "info",
        event: "codex_upstream_fetch",
        request_id: options.requestId,
        upstream_mode: "external_relay",
        upstream_host: safeHost(relayUrl),
        user_id: user.id,
        has_account_id: Boolean(accountId)
      })
    );
    return fetch(relayUrl, init);
  }

  if (env.ENABLE_CONTAINER_RELAY === "true" && env.UPSTREAM_RELAY) {
    console.log(
      JSON.stringify({
        level: "info",
        event: "codex_upstream_fetch",
        request_id: options.requestId,
        upstream_mode: "container_relay",
        user_id: user.id,
        has_account_id: Boolean(accountId)
      })
    );
    return postCodexViaContainer(env, init);
  }

  const upstreamUrl = env.CODEX_UPSTREAM_URL ?? DEFAULT_CODEX_UPSTREAM_URL;
  console.log(
    JSON.stringify({
      level: "info",
      event: "codex_upstream_fetch",
      request_id: options.requestId,
      upstream_mode: "direct",
      upstream_host: safeHost(upstreamUrl),
      user_id: user.id,
      has_account_id: Boolean(accountId)
    })
  );

  return fetch(upstreamUrl, init);
}

export function resolveUpstreamMode(env: RuntimeEnv): string {
  if (resolveCodexRelayUrl(env)) {
    return "external_relay";
  }

  if (env.ENABLE_CONTAINER_RELAY === "true" && env.UPSTREAM_RELAY) {
    return "container_relay";
  }

  return "direct";
}

function applyRelayAuthHeader(env: RuntimeEnv, headers: Headers): void {
  const relayToken = env.UPSTREAM_RELAY_TOKEN?.trim();
  if (relayToken) {
    headers.set("X-Relay-Token", relayToken);
  }
}

async function postCodexViaContainer(env: RuntimeEnv, init: RequestInit): Promise<Response> {
  const relay = env.UPSTREAM_RELAY;
  if (!relay) {
    throw new Error("UPSTREAM_RELAY binding is not configured");
  }

  const container = relay.getByName(UPSTREAM_RELAY_INSTANCE) as DurableObjectStub & {
    startAndWaitForPorts(): Promise<void>;
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  };

  await container.startAndWaitForPorts();
  return container.fetch(new Request("http://codex-upstream-relay/", init));
}

export async function openAIErrorFromUpstream(response: Response): Promise<Response> {
  const contentType = response.headers.get("content-type") ?? "";
  let upstreamDetail: string | undefined;

  if (contentType.includes("application/json")) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string; code?: string };
      message?: string;
      detail?: string;
    } | null;
    upstreamDetail =
      payload?.error?.message ??
      payload?.message ??
      payload?.detail ??
      undefined;
  } else {
    const text = await response.text().catch(() => "");
    const cfMitigated = response.headers.get("cf-mitigated");
    if (cfMitigated) {
      upstreamDetail = `Cloudflare challenge (${cfMitigated})`;
    } else if (text.includes("Just a moment")) {
      upstreamDetail = "Cloudflare challenge page";
    }
  }

  if (upstreamDetail) {
    console.warn(
      JSON.stringify({
        level: "warn",
        event: "codex_upstream_error",
        status: response.status,
        detail: upstreamDetail.slice(0, 500)
      })
    );
  }

  const message = genericUpstreamMessage(response.status);
  const error: OpenAIError = {
    error: {
      message,
      type: response.status === 401 ? "authentication_error" : "upstream_error",
      code: `upstream_${response.status}`
    }
  };

  return Response.json(error, {
    status: response.status,
    headers: { "Cache-Control": "no-store" }
  });
}

function genericUpstreamMessage(status: number): string {
  if (status === 401) {
    return "Codex upstream rejected the request (authentication failed)";
  }
  if (status === 403) {
    return "Codex upstream rejected the request (forbidden)";
  }
  if (status === 429) {
    return "Codex upstream rate limit exceeded";
  }
  if (status >= 500) {
    return "Codex upstream server error";
  }
  return `Codex upstream request failed (${status})`;
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "invalid";
  }
}
