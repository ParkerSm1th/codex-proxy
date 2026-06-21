import type { RuntimeEnv } from "./env";
import { authenticateRequest, errorResponse, jsonError, type AuthResult } from "./auth";
import { v1Cors } from "./cors";
import { fetchCodexResponses, openAIErrorFromUpstream, resolveUpstreamMode } from "./codex";
import { normalizeModel, openAIModelsResponse } from "./models";
import { createRequestLogger, withRequestId, type RequestLogger } from "./observability";
import { scheduleProxyRequestLog } from "./dashboard/proxy-logging";
import {
  assertChatCompletionRequest,
  isResponsesShapedChatRequest,
  MissingMessagesError,
  normalizeCursorResponsesBody,
  summarizeRequestBody
} from "./request-format";
import {
  chatCompletionsToResponsesRequest,
  collectChatCompletion,
  parseUsage,
  responsesSseToChatCompletionsStream,
  type TokenUsage
} from "./transform";
import type { ChatCompletionRequest } from "./types";

const STREAM_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no"
};

export async function handleOpenAICompatibleRequest(
  request: Request,
  env: RuntimeEnv,
  ctx: ExecutionContext
): Promise<Response> {
  const startedAt = Date.now();
  let log = createRequestLogger(request);

  try {
    if (request.method === "OPTIONS") {
      return v1Cors(new Response(null, { status: 204 }));
    }

    const url = new URL(request.url);
    const auth = await authenticateRequest(request, env, ctx);
    log = createRequestLogger(request, auth.user);

    if (url.pathname === "/v1/models" && request.method === "GET") {
      const response = v1Cors(Response.json(openAIModelsResponse(), { headers: { "Cache-Control": "no-store" } }));
      log.complete(response.status, startedAt, { route: "models" });
      return withRequestId(response, log.context.requestId);
    }

    if (url.pathname === "/v1/chat/completions" && request.method === "POST") {
      const response = v1Cors(await handleChatCompletions(request, env, auth, ctx, log));
      log.complete(response.status, startedAt, { route: "chat_completions" });
      return withRequestId(response, log.context.requestId);
    }

    if (url.pathname === "/v1/responses" && request.method === "POST") {
      const response = v1Cors(await handleResponsesPassthrough(request, env, auth, ctx, log));
      log.complete(response.status, startedAt, { route: "responses" });
      return withRequestId(response, log.context.requestId);
    }

    const response = v1Cors(jsonError("Route not found", 404, "invalid_request_error", "not_found"));
    log.complete(response.status, startedAt, { route: "not_found" });
    return withRequestId(response, log.context.requestId);
  } catch (error) {
    log.error("request_failed", {
      error: error instanceof Error ? error.message : "Unexpected server error",
      error_name: error instanceof Error ? error.name : "unknown"
    });
    const response = v1Cors(errorResponse(error));
    log.complete(response.status, startedAt, { route: "error" });
    return withRequestId(response, log.context.requestId);
  }
}

async function handleChatCompletions(
  request: Request,
  env: RuntimeEnv,
  auth: AuthResult,
  ctx: ExecutionContext,
  log: RequestLogger
): Promise<Response> {
  const user = auth.user;
  const startedAt = Date.now();
  const upstreamMode = resolveUpstreamMode(env);
  const logContext = {
    env,
    userId: user.id,
    apiKeyId: auth.apiKeyId,
    requestId: log.context.requestId,
    route: "chat_completions",
    upstreamMode
  };

  const finishLog = (status: number, usage?: TokenUsage | null, errorMessage?: string | null) => {
    scheduleProxyRequestLog(ctx, { ...logContext, startedAt, model: modelId ?? null }, status, usage, errorMessage);
  };

  let modelId: string;
  const rawBody = (await request.json()) as Record<string, unknown>;
  log.info("request_body_summary", summarizeRequestBody(rawBody));

  const upstreamStartedAt = Date.now();
  let upstreamBody: unknown;
  let stream = rawBody.stream !== false;

  if (isResponsesShapedChatRequest(rawBody)) {
    log.info("detected_request_format", { format: "responses_on_chat_completions" });
    const model = normalizeModel(typeof rawBody.model === "string" ? rawBody.model : undefined);
    modelId = model.id;
    upstreamBody = normalizeCursorResponsesBody(rawBody);
  } else {
    try {
      assertChatCompletionRequest(rawBody);
    } catch (error) {
      if (error instanceof MissingMessagesError) {
        log.warn("invalid_chat_request", { body_keys: error.bodyKeys });
      }
      throw error;
    }

    log.info("detected_request_format", { format: "chat_completions" });
    const chatRequest = rawBody as ChatCompletionRequest;
    const model = normalizeModel(chatRequest.model);
    modelId = model.id;
    stream = chatRequest.stream !== false;
    upstreamBody = chatCompletionsToResponsesRequest(chatRequest);
  }

  const upstream = await fetchCodexResponses(env, user, upstreamBody, {
    ...codexOptions(rawBody, request),
    requestId: log.context.requestId
  });
  log.info("upstream_response", {
    status: upstream.status,
    duration_ms: Date.now() - upstreamStartedAt
  });

  if (!upstream.ok) {
    const errorResponse = await openAIErrorFromUpstream(upstream);
    finishLog(errorResponse.status, null, "upstream_error");
    return errorResponse;
  }

  if (!upstream.body) {
    finishLog(502, null, "empty_upstream_body");
    return jsonError("Codex upstream returned an empty body", 502, "upstream_error", "empty_upstream_body");
  }

  if (stream === false) {
    const payload = await collectChatCompletion(upstream.body, modelId);
    const usage = isRecord(payload) && isRecord(payload.usage) ? parseUsage({ usage: payload.usage }) : null;
    finishLog(200, usage);
    return Response.json(payload, {
      headers: { "Cache-Control": "no-store" }
    });
  }

  return new Response(
    responsesSseToChatCompletionsStream(upstream.body, modelId, (usage) => {
      finishLog(200, usage);
    }),
    {
      status: 200,
      headers: STREAM_HEADERS
    }
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function handleResponsesPassthrough(
  request: Request,
  env: RuntimeEnv,
  auth: AuthResult,
  ctx: ExecutionContext,
  log: RequestLogger
): Promise<Response> {
  const user = auth.user;
  const startedAt = Date.now();
  const upstreamMode = resolveUpstreamMode(env);
  const body = (await request.json()) as Record<string, unknown>;
  log.info("request_body_summary", summarizeRequestBody(body));
  log.info("detected_request_format", { format: "responses" });

  const upstreamStartedAt = Date.now();
  const upstreamBody = isResponsesShapedChatRequest(body)
    ? normalizeCursorResponsesBody(body)
    : ensureResponsesInstructions({ ...body, store: false });
  const upstream = await fetchCodexResponses(env, user, upstreamBody, {
    ...codexOptions(body, request),
    requestId: log.context.requestId
  });
  log.info("upstream_response", {
    status: upstream.status,
    duration_ms: Date.now() - upstreamStartedAt
  });

  const model = typeof body.model === "string" ? normalizeModel(body.model).id : null;

  if (!upstream.ok) {
    const errorResponse = await openAIErrorFromUpstream(upstream);
    scheduleProxyRequestLog(
      ctx,
      {
        env,
        userId: user.id,
        apiKeyId: auth.apiKeyId,
        requestId: log.context.requestId,
        route: "responses",
        model,
        startedAt,
        upstreamMode
      },
      errorResponse.status,
      null,
      "upstream_error"
    );
    return errorResponse;
  }

  scheduleProxyRequestLog(
    ctx,
    {
      env,
      userId: user.id,
      apiKeyId: auth.apiKeyId,
      requestId: log.context.requestId,
      route: "responses",
      model,
      startedAt,
      upstreamMode
    },
    upstream.status
  );

  return new Response(upstream.body, {
    status: upstream.status,
    headers: filterPassthroughHeaders(upstream.headers)
  });
}

function sessionIdFromRequest(body: Record<string, unknown>): string | undefined {
  if (typeof body.session_id === "string") {
    return body.session_id;
  }

  if (typeof body.user === "string") {
    return `cursor-${body.user}`;
  }

  return undefined;
}

function codexOptions(body: Record<string, unknown>, request: Request): { sessionId?: string; signal: AbortSignal } {
  const sessionId = sessionIdFromRequest(body);
  return sessionId ? { sessionId, signal: request.signal } : { signal: request.signal };
}

function ensureResponsesInstructions(body: Record<string, unknown>): Record<string, unknown> {
  if (typeof body.instructions === "string" && body.instructions.length > 0) {
    return body;
  }

  return {
    ...body,
    instructions: "You are a helpful assistant."
  };
}

function filterPassthroughHeaders(headers: Headers): Headers {
  const next = new Headers();
  const contentType = headers.get("content-type") ?? "text/event-stream; charset=utf-8";
  next.set("Content-Type", contentType);
  next.set("Cache-Control", "no-cache, no-transform");
  return next;
}

