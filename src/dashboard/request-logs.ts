import type { RuntimeEnv } from "../env";

export interface RequestLogInput {
  userId: string;
  apiKeyId?: string | null;
  requestId: string;
  route: string;
  model?: string | null;
  status: number;
  durationMs?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  upstreamMode?: string | null;
  errorMessage?: string | null;
}

export async function persistRequestLog(env: RuntimeEnv, input: RequestLogInput): Promise<void> {
  const estimatedSavings = await estimateSavings(env, input.model, input.inputTokens, input.outputTokens);

  await env.DB.prepare(
    `INSERT INTO request_logs (
      id, user_id, api_key_id, request_id, route, model, status, duration_ms,
      input_tokens, output_tokens, estimated_savings_usd, upstream_mode, error_message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      crypto.randomUUID(),
      input.userId,
      input.apiKeyId ?? null,
      input.requestId,
      input.route,
      input.model ?? null,
      input.status,
      input.durationMs ?? null,
      input.inputTokens ?? null,
      input.outputTokens ?? null,
      estimatedSavings,
      input.upstreamMode ?? null,
      input.errorMessage ?? null
    )
    .run();
}

export async function estimateSavings(
  env: RuntimeEnv,
  model: string | null | undefined,
  inputTokens: number | null | undefined,
  outputTokens: number | null | undefined
): Promise<number | null> {
  if (!model || inputTokens == null || outputTokens == null) {
    return null;
  }

  const baseModel = model.replace(/-(low|medium|high)$/u, "");
  const pricing = await env.DB.prepare(
    "SELECT input_usd_per_million, output_usd_per_million FROM model_pricing WHERE model = ? LIMIT 1"
  )
    .bind(baseModel)
    .first<{ input_usd_per_million: number; output_usd_per_million: number }>();

  if (!pricing) {
    return null;
  }

  const inputCost = (inputTokens * pricing.input_usd_per_million) / 1_000_000;
  const outputCost = (outputTokens * pricing.output_usd_per_million) / 1_000_000;
  return Number((inputCost + outputCost).toFixed(6));
}

export interface SavingsSummary {
  totalRequests: number;
  successfulRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedSavingsUsd: number;
}

export async function getSavingsSummary(env: RuntimeEnv, userId: string): Promise<SavingsSummary> {
  const row = await env.DB.prepare(
    `SELECT
       COUNT(*) AS total_requests,
       SUM(CASE WHEN status >= 200 AND status < 300 THEN 1 ELSE 0 END) AS successful_requests,
       COALESCE(SUM(input_tokens), 0) AS total_input_tokens,
       COALESCE(SUM(output_tokens), 0) AS total_output_tokens,
       COALESCE(SUM(estimated_savings_usd), 0) AS estimated_savings_usd
     FROM request_logs
    WHERE user_id = ?`
  )
    .bind(userId)
    .first<{
      total_requests: number;
      successful_requests: number;
      total_input_tokens: number;
      total_output_tokens: number;
      estimated_savings_usd: number;
    }>();

  return {
    totalRequests: row?.total_requests ?? 0,
    successfulRequests: row?.successful_requests ?? 0,
    totalInputTokens: row?.total_input_tokens ?? 0,
    totalOutputTokens: row?.total_output_tokens ?? 0,
    estimatedSavingsUsd: row?.estimated_savings_usd ?? 0
  };
}

export async function listRequestLogs(
  env: RuntimeEnv,
  userId: string,
  limit = 50
): Promise<
  Array<{
    id: string;
    requestId: string;
    route: string;
    model: string | null;
    status: number;
    durationMs: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    estimatedSavingsUsd: number | null;
    upstreamMode: string | null;
    errorMessage: string | null;
    createdAt: string;
  }>
> {
  const result = await env.DB.prepare(
    `SELECT id, request_id, route, model, status, duration_ms, input_tokens, output_tokens,
            estimated_savings_usd, upstream_mode, error_message, created_at
       FROM request_logs
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?`
  )
    .bind(userId, limit)
    .all<{
      id: string;
      request_id: string;
      route: string;
      model: string | null;
      status: number;
      duration_ms: number | null;
      input_tokens: number | null;
      output_tokens: number | null;
      estimated_savings_usd: number | null;
      upstream_mode: string | null;
      error_message: string | null;
      created_at: string;
    }>();

  return (result.results ?? []).map((row) => ({
    id: row.id,
    requestId: row.request_id,
    route: row.route,
    model: row.model,
    status: row.status,
    durationMs: row.duration_ms,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    estimatedSavingsUsd: row.estimated_savings_usd,
    upstreamMode: row.upstream_mode,
    errorMessage: row.error_message,
    createdAt: row.created_at
  }));
}
