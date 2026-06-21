export type ReasoningEffort = "low" | "medium" | "high" | "xhigh";

export interface ModelInfo {
  id: string;
  upstream: string;
  reasoningEffort?: ReasoningEffort;
}

const MODELS: ModelInfo[] = [
  { id: "gpt-5.5", upstream: "gpt-5.5" },
  { id: "gpt-5.5-codex", upstream: "gpt-5.5" },
  { id: "gpt-5.4", upstream: "gpt-5.4" },
  { id: "gpt-5.4-mini", upstream: "gpt-5.4-mini" },
  { id: "gpt-5.3-codex", upstream: "gpt-5.3-codex" },
  { id: "gpt-5.3-codex-spark", upstream: "gpt-5.3-codex-spark" }
];

// Longer suffixes first so `gpt-5.5-extra-high` maps to xhigh, not high on `gpt-5.5-extra`.
const REASONING_SUFFIXES: Array<{ suffix: string; effort: ReasoningEffort }> = [
  { suffix: "extra-high", effort: "xhigh" },
  { suffix: "extra", effort: "xhigh" },
  { suffix: "low", effort: "low" },
  { suffix: "medium", effort: "medium" },
  { suffix: "high", effort: "high" }
];

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
      owned_by: "usemysub"
    }))
  };
}

export function normalizeModel(model: string | undefined): ModelInfo {
  const requested = model ?? "gpt-5.5";

  for (const { suffix, effort } of REASONING_SUFFIXES) {
    const marker = `-${suffix}`;
    if (!requested.endsWith(marker)) {
      continue;
    }

    const baseName = requested.slice(0, -marker.length);
    const configured = MODELS.find((entry) => entry.id === baseName);
    const result = configured ?? { id: requested, upstream: baseName };

    return {
      ...result,
      id: requested,
      reasoningEffort: effort
    };
  }

  const configured = MODELS.find((entry) => entry.id === requested);
  return configured ?? { id: requested, upstream: requested };
}
