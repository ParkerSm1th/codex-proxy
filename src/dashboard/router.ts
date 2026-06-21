import type { RuntimeEnv } from "../env";
import { clientIp, checkRateLimit, rateLimitResponse } from "../rate-limit";
import { completeCodexOAuth, startCodexOAuth } from "./codex-oauth";
import { requestMagicLink, verifyMagicLink } from "./magic-link";
import {
  createApiKey,
  DashboardError,
  getCodexStatus,
  linkCodexAuth,
  listApiKeys,
  revokeApiKey
} from "./service";
import { getSavingsSummary, listRequestLogs } from "./request-logs";
import {
  clearSessionCookie,
  createSession as issueSession,
  getSessionUser,
  invalidateUserSessions,
  sessionCookie
} from "./session";

const MAGIC_LINK_LIMIT = 5;
const MAGIC_LINK_WINDOW_MS = 60_000;

export async function handleDashboardRequest(
  request: Request,
  env: RuntimeEnv,
  ctx: ExecutionContext
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) {
    return null;
  }

  try {
    if (url.pathname === "/api/auth/magic-link" && request.method === "POST") {
      const rateKey = `magic-link:${clientIp(request)}`;
      const rate = checkRateLimit(rateKey, MAGIC_LINK_LIMIT, MAGIC_LINK_WINDOW_MS);
      if (!rate.allowed) {
        return rateLimitResponse(rate.retryAfterSeconds ?? 60);
      }

      const body = (await request.json()) as { email?: string };
      if (!body.email) {
        return dashboardJson({ error: "Email is required" }, 400);
      }

      const result = await requestMagicLink(env, request, body.email);
      return dashboardJson(result);
    }

    if (
      url.pathname === "/api/auth/verify" &&
      (request.method === "GET" || request.method === "HEAD")
    ) {
      const token = url.searchParams.get("token");
      if (!token) {
        return redirectWithError(request, "Missing sign-in token");
      }

      try {
        const { userId } = await verifyMagicLink(env, token);
        await invalidateUserSessions(env, userId);
        const sessionToken = await issueSession(env, userId);
        const codex = await getCodexStatus(env, userId);
        const destination = codex.linked ? "/dashboard" : "/onboarding";

        return authRedirectResponse(request, destination, sessionCookie(sessionToken, request));
      } catch (error) {
        if (error instanceof DashboardError) {
          return redirectWithError(request, error.message);
        }
        throw error;
      }
    }

    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      const user = await getSessionUser(env, request);
      if (user) {
        const { getSessionToken, deleteSession } = await import("./session");
        const token = getSessionToken(request);
        if (token) {
          ctx.waitUntil(deleteSession(env, token));
        }
      }
      return dashboardJson({ ok: true }, 200, { "Set-Cookie": clearSessionCookie(request) });
    }

    if (url.pathname === "/api/auth/me" && request.method === "GET") {
      const user = await requireUser(env, request);
      return dashboardJson({ user });
    }

    if (url.pathname === "/api/keys" && request.method === "GET") {
      const user = await requireUser(env, request);
      return dashboardJson({ keys: await listApiKeys(env, user.id) });
    }

    if (url.pathname === "/api/keys" && request.method === "POST") {
      const user = await requireUser(env, request);
      const body = (await request.json()) as { label?: string };
      const created = await createApiKey(env, user.id, body.label?.trim() || "default");
      return dashboardJson(
        {
          key: {
            id: created.id,
            prefix: created.prefix,
            apiKey: created.apiKey
          }
        },
        201
      );
    }

    const revokeMatch = url.pathname.match(/^\/api\/keys\/([^/]+)$/u);
    if (revokeMatch && request.method === "DELETE") {
      const user = await requireUser(env, request);
      await revokeApiKey(env, user.id, decodeURIComponent(revokeMatch[1] ?? ""));
      return dashboardJson({ ok: true });
    }

    if (url.pathname === "/api/codex/status" && request.method === "GET") {
      const user = await requireUser(env, request);
      return dashboardJson({ codex: await getCodexStatus(env, user.id) });
    }

    if (url.pathname === "/api/codex/oauth/start" && request.method === "POST") {
      const user = await requireUser(env, request);
      return dashboardJson(await startCodexOAuth(env, user.id));
    }

    if (url.pathname === "/api/codex/oauth/complete" && request.method === "POST") {
      const user = await requireUser(env, request);
      const body = (await request.json()) as { callbackUrl?: string };
      if (!body.callbackUrl?.trim()) {
        return dashboardJson({ error: "callbackUrl is required" }, 400);
      }
      await completeCodexOAuth(env, user, body.callbackUrl);
      return dashboardJson({ codex: await getCodexStatus(env, user.id) });
    }

    if (url.pathname === "/api/codex/link" && request.method === "POST") {
      const user = await requireUser(env, request);
      const body = (await request.json()) as { auth?: Record<string, unknown> };
      if (!body.auth) {
        return dashboardJson({ error: "auth JSON is required" }, 400);
      }
      await linkCodexAuth(env, user, body.auth);
      return dashboardJson({ codex: await getCodexStatus(env, user.id) });
    }

    if (url.pathname === "/api/requests" && request.method === "GET") {
      const user = await requireUser(env, request);
      const limit = parseLimitParam(url.searchParams.get("limit"));
      return dashboardJson({ requests: await listRequestLogs(env, user.id, limit) });
    }

    if (url.pathname === "/api/stats/savings" && request.method === "GET") {
      const user = await requireUser(env, request);
      return dashboardJson({ savings: await getSavingsSummary(env, user.id) });
    }

    return dashboardJson({ error: "Not found" }, 404);
  } catch (error) {
    if (error instanceof DashboardError) {
      return dashboardJson({ error: error.message }, error.status);
    }

    console.error(
      JSON.stringify({
        level: "error",
        event: "dashboard_request_error",
        error: error instanceof Error ? error.message : "Unexpected error"
      })
    );
    return dashboardJson({ error: "Internal server error" }, 500);
  }
}

async function requireUser(env: RuntimeEnv, request: Request) {
  const user = await getSessionUser(env, request);
  if (!user) {
    throw new DashboardError(401, "Not authenticated");
  }
  return user;
}

function redirectWithError(request: Request, message: string): Response {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("error", message);
  return authRedirectResponse(request, `${loginUrl.pathname}${loginUrl.search}`);
}

function authRedirectResponse(
  request: Request,
  location: string,
  setCookie?: string
): Response {
  const headers = new Headers({
    Location: location,
    "Cache-Control": "no-store, no-cache, must-revalidate, private"
  });
  if (setCookie) {
    headers.set("Set-Cookie", setCookie);
  }
  return new Response(null, { status: 302, headers });
}

function parseLimitParam(value: string | null, defaultLimit = 50, maxLimit = 200): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return defaultLimit;
  }
  return Math.min(parsed, maxLimit);
}

function dashboardJson(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    ...extraHeaders
  });
  return new Response(JSON.stringify(body), { status, headers });
}
