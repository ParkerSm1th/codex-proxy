import type { AuthenticatedUser } from "./types";

export interface RequestLogContext {
  requestId: string;
  method: string;
  path: string;
  userId?: string;
}

export interface RequestLogger {
  context: RequestLogContext;
  info: (event: string, fields?: Record<string, unknown>) => void;
  warn: (event: string, fields?: Record<string, unknown>) => void;
  error: (event: string, fields?: Record<string, unknown>) => void;
  complete: (status: number, startedAt: number, fields?: Record<string, unknown>) => void;
}

export function createRequestLogger(request: Request, user?: AuthenticatedUser): RequestLogger {
  const url = new URL(request.url);
  const context: RequestLogContext = {
    requestId: request.headers.get("cf-ray") ?? crypto.randomUUID(),
    method: request.method,
    path: url.pathname,
    userId: user?.id
  };

  return {
    context,
    info(event, fields) {
      writeLog("info", context, event, fields);
    },
    warn(event, fields) {
      writeLog("warn", context, event, fields);
    },
    error(event, fields) {
      writeLog("error", context, event, fields);
    },
    complete(status, startedAt, fields) {
      writeLog("info", context, "request_complete", {
        status,
        duration_ms: Date.now() - startedAt,
        ...fields
      });
    }
  };
}

export function withRequestId(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Request-Id", requestId);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function writeLog(
  level: "info" | "warn" | "error",
  context: RequestLogContext,
  event: string,
  fields?: Record<string, unknown>
): void {
  const payload = {
    level,
    event,
    request_id: context.requestId,
    method: context.method,
    path: context.path,
    user_id: context.userId,
    ...fields
  };

  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}
