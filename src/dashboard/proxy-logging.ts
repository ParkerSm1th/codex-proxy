import type { RuntimeEnv } from "../env";
import { persistRequestLog } from "./request-logs";

export interface ProxyRequestLogContext {
  env: RuntimeEnv;
  userId: string;
  apiKeyId?: string | null;
  requestId: string;
  route: string;
  model?: string | null;
  startedAt: number;
  upstreamMode?: string | null;
}

export function scheduleProxyRequestLog(
  ctx: ExecutionContext,
  context: ProxyRequestLogContext,
  status: number,
  usage?: { input_tokens?: number; output_tokens?: number } | null,
  errorMessage?: string | null
): void {
  ctx.waitUntil(
    persistRequestLog(context.env, {
      userId: context.userId,
      apiKeyId: context.apiKeyId ?? null,
      requestId: context.requestId,
      route: context.route,
      model: context.model ?? null,
      status,
      durationMs: Date.now() - context.startedAt,
      inputTokens: usage?.input_tokens ?? null,
      outputTokens: usage?.output_tokens ?? null,
      upstreamMode: context.upstreamMode ?? null,
      errorMessage: errorMessage ?? null
    })
  );
}
