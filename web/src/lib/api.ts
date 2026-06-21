export interface DashboardUser {
  id: string;
  email: string;
  displayName: string | null;
  hasCodexTokens: boolean;
  reauthRequired: boolean;
}

export interface ApiKeySummary {
  id: string;
  label: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  disabled: boolean;
}

export interface SavingsSummary {
  totalRequests: number;
  successfulRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedSavingsUsd: number;
}

export interface RequestLogEntry {
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
}

export interface CodexStatus {
  linked: boolean;
  chatgptAccountId?: string | null;
  lastRefresh?: string | null;
  reauthRequired?: boolean;
  updatedAt?: string;
  tokenVersion?: number;
}

class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new ApiError(payload.error ?? "Request failed", response.status);
  }

  return payload as T;
}

export const api = {
  me: () => request<{ user: DashboardUser }>("/api/auth/me"),
  login: (email: string, password: string) =>
    request<{ user: DashboardUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  listKeys: () => request<{ keys: ApiKeySummary[] }>("/api/keys"),
  createKey: (label: string) =>
    request<{ key: { id: string; prefix: string; apiKey: string } }>("/api/keys", {
      method: "POST",
      body: JSON.stringify({ label })
    }),
  revokeKey: (id: string) => request<{ ok: boolean }>(`/api/keys/${encodeURIComponent(id)}`, { method: "DELETE" }),
  codexStatus: () => request<{ codex: CodexStatus }>("/api/codex/status"),
  linkCodex: (auth: Record<string, unknown>) =>
    request<{ codex: CodexStatus }>("/api/codex/link", {
      method: "POST",
      body: JSON.stringify({ auth })
    }),
  savings: () => request<{ savings: SavingsSummary }>("/api/stats/savings"),
  requests: (limit = 100) => request<{ requests: RequestLogEntry[] }>(`/api/requests?limit=${limit}`)
};

export { ApiError };
