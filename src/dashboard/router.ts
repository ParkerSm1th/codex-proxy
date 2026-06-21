import { jsonError } from "../auth";
import { dashboardCors } from "../cors";
import type { RuntimeEnv } from "../env";
import { clientIp, checkRateLimit, rateLimitResponse } from "../rate-limit";
import {
  createApiKey,
  DashboardError,
  getCodexStatus,
  linkCodexAuth,
  listApiKeys,
  loginUser,
  registerUser,
  revokeApiKey
} from "./service";
import { getSavingsSummary, listRequestLogs } from "./request-logs";
import { PasswordPolicyError } from "./password";
import {
  clearSessionCookie,
  createSession as issueSession,
  getSessionUser,
  invalidateUserSessions,
  sessionCookie
} from "./session";

const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 60_000;

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
    if (url.pathname === "/api/auth/register" && request.method === "POST") {
      const body = (await request.json()) as { email?: string; password?: string; displayName?: string };
      if (!body.email || !body.password) {
        return dashboardJson({ error: "Email and password are required" }, 400);
      }

      const { userId } = await registerUser(env, {
        email: body.email.trim().toLowerCase(),
        password: body.password,
        displayName: body.displayName ?? null
      });
      await invalidateUserSessions(env, userId);
      const token = await issueSession(env, userId);
      return dashboardJson({ user: await getSessionUser(env, withSession(request, token)) }, 201, {
        "Set-Cookie": sessionCookie(token, request)
      });
    }

    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      const rateKey = `login:${clientIp(request)}`;
      const rate = checkRateLimit(rateKey, LOGIN_LIMIT, LOGIN_WINDOW_MS);
      if (!rate.allowed) {
        return rateLimitResponse(rate.retryAfterSeconds ?? 60);
      }

      const body = (await request.json()) as { email?: string; password?: string };
      if (!body.email || !body.password) {
        return dashboardJson({ error: "Email and password are required" }, 400);
      }

      const { userId } = await loginUser(env, {
        email: body.email.trim().toLowerCase(),
        password: body.password
      });
      await invalidateUserSessions(env, userId);
      const token = await issueSession(env, userId);
      return dashboardJson({ user: await getSessionUser(env, withSession(request, token)) }, 200, {
        "Set-Cookie": sessionCookie(token, request)
      });
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

    if (error instanceof PasswordPolicyError) {
      return dashboardJson({ error: error.message }, 400);
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

function withSession(request: Request, token: string): Request {
  const headers = new Headers(request.headers);
  headers.set("cookie", `${headers.get("cookie") ?? ""}; codex_session=${encodeURIComponent(token)}`);
  return new Request(request.url, { headers, method: request.method });
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
