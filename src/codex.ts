import type { RuntimeEnv } from "./env";
import { sanitizeCodexUpstreamBody } from "./request-format";
import { CODEX_ORIGINATOR, DEFAULT_CODEX_UPSTREAM_URL, USER_AGENT } from "./constants";
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

  const init: RequestInit = {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  };

  if (options.signal) {
    init.signal = options.signal;
  }

  if (env.CODEX_RELAY_URL) {
    console.log(
      JSON.stringify({
        level: "info",
        event: "codex_upstream_fetch",
        request_id: options.requestId,
        upstream_mode: "external_relay",
        upstream_host: safeHost(env.CODEX_RELAY_URL),
        user_id: user.id,
        has_account_id: Boolean(accountId)
      })
    );
    return fetch(env.CODEX_RELAY_URL, init);
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
  if (env.CODEX_RELAY_URL) {
    return "external_relay";
  }

  if (env.ENABLE_CONTAINER_RELAY === "true" && env.UPSTREAM_RELAY) {
    return "container_relay";
  }

  return "direct";
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
  let message = `Codex upstream returned ${response.status}`;

  if (contentType.includes("application/json")) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string; code?: string };
      message?: string;
      detail?: string;
    } | null;
    message =
      payload?.error?.message ??
      payload?.message ??
      payload?.detail ??
      message;
  } else {
    const text = await response.text().catch(() => "");
    const cfMitigated = response.headers.get("cf-mitigated");
    if (cfMitigated) {
      message = `Codex upstream blocked the request with a Cloudflare challenge (${cfMitigated})`;
    } else if (text.includes("Just a moment")) {
      message = "Codex upstream blocked the request with a Cloudflare challenge page";
    } else if (text.length > 0 && text.length < 500) {
      message = text;
    } else if (text.length > 0) {
      message = `${message}: ${text.slice(0, 200)}`;
    }
  }

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

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "invalid";
  }
}
