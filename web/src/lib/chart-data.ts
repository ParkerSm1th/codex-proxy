import type { RequestLogEntry, SavingsSummary } from "@/lib/api";

export type ChartPoint = {
  date: string;
  requests: number;
  savings: number;
  tokens: number;
};

export type ChartRange = "7d" | "30d" | "90d";

export function aggregateRequestChartData(requests: RequestLogEntry[], range: ChartRange) {
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  const buckets = new Map<string, { date: string; requests: number; savings: number; tokens: number }>();

  for (let index = 0; index < days; index += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    const key = day.toISOString().slice(0, 10);
    buckets.set(key, {
      date: day.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      requests: 0,
      savings: 0,
      tokens: 0
    });
  }

  for (const request of requests) {
    const key = request.createdAt.slice(0, 10);
    const bucket = buckets.get(key);
    if (!bucket) {
      continue;
    }
    bucket.requests += 1;
    bucket.savings += request.estimatedSavingsUsd ?? 0;
    bucket.tokens += (request.inputTokens ?? 0) + (request.outputTokens ?? 0);
  }

  return Array.from(buckets.values());
}

export function successRate(savings: SavingsSummary): string {
  if (savings.totalRequests === 0) {
    return "0%";
  }
  return `${Math.round((savings.successfulRequests / savings.totalRequests) * 100)}%`;
}
