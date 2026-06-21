export interface ModelInfo {
  id: string;
  upstream: string;
  reasoningEffort?: "low" | "medium" | "high";
}

const MODELS: ModelInfo[] = [
  { id: "gpt-5.5", upstream: "gpt-5.5" },
  { id: "gpt-5.5-codex", upstream: "gpt-5.5" },
  { id: "gpt-5.4", upstream: "gpt-5.4" },
  { id: "gpt-5.4-mini", upstream: "gpt-5.4-mini" },
  { id: "gpt-5.3-codex", upstream: "gpt-5.3-codex" },
  { id: "gpt-5.3-codex-spark", upstream: "gpt-5.3-codex-spark" }
];

const REASONING_SUFFIXES: Record<string, "low" | "medium" | "high"> = {
  low: "low",
  medium: "medium",
  high: "high"
};

export function listModels(): ModelInfo[] {
  return MODELS;
}

export function openAIModelsResponse(now = Math.floor(Date.now() / 1000)): unknown {
  return {
    object: "list",
    data: MODELS.map((model) => ({
      id: model.id,
      object: "model",
      created: now,
      owned_by: "codex-proxy"
    }))
  };
}

export function normalizeModel(model: string | undefined): ModelInfo {
  const requested = model ?? "gpt-5.5";
  const suffixMatch = requested.match(/^(.*)-(low|medium|high)$/);
  const baseName = suffixMatch?.[1] ?? requested;
  const configured = MODELS.find((entry) => entry.id === baseName);
  const result = configured ?? { id: requested, upstream: baseName };

  if (!suffixMatch) {
    return result;
  }

  const reasoningEffort = REASONING_SUFFIXES[suffixMatch[2] as keyof typeof REASONING_SUFFIXES];
  if (!reasoningEffort) {
    return result;
  }

  return {
    ...result,
    id: requested,
    reasoningEffort
  };
}
