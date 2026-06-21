import { normalizeModel } from "./models";
import type { ChatCompletionRequest } from "./types";

const CURSOR_ONLY_FIELDS = new Set([
  "include",
  "prompt_cache_retention",
  "previous_response_id",
  "truncation",
  "text",
  "stream_options",
  "user",
  "metadata"
]);

const UNSUPPORTED_CODEX_FIELDS = CURSOR_ONLY_FIELDS;

export function isResponsesShapedChatRequest(body: Record<string, unknown>): boolean {
  return Array.isArray(body.input) && !Array.isArray(body.messages);
}

export function normalizeCursorResponsesBody(body: Record<string, unknown>): Record<string, unknown> {
  const model = normalizeModel(typeof body.model === "string" ? body.model : undefined);
  const instructions =
    typeof body.instructions === "string" && body.instructions.length > 0
      ? body.instructions
      : "You are a helpful assistant.";
  const normalized: Record<string, unknown> = {
    model: model.upstream,
    input: body.input,
    instructions,
    stream: body.stream !== false,
    store: false
  };

  const tools = normalizeResponsesTools(body.tools);
  if (tools.length > 0) {
    normalized.tools = tools;
  }

  const toolChoice = normalizeResponsesToolChoice(body.tool_choice, tools.length > 0);
  if (toolChoice === "none") {
    normalized.tools = [];
  } else if (toolChoice) {
    normalized.tool_choice = toolChoice;
  }

  if (typeof body.parallel_tool_calls === "boolean") {
    normalized.parallel_tool_calls = body.parallel_tool_calls;
  }

  if (body.reasoning) {
    normalized.reasoning = body.reasoning;
  } else if (model.reasoningEffort) {
    normalized.reasoning = { effort: model.reasoningEffort };
  }

  return normalized;
}

export function sanitizeCodexUpstreamBody(body: unknown): unknown {
  if (!isRecord(body)) {
    return body;
  }

  const sanitized = { ...body };
  for (const key of UNSUPPORTED_CODEX_FIELDS) {
    delete sanitized[key];
  }

  return sanitized;
}

export function summarizeRequestBody(body: Record<string, unknown>): Record<string, unknown> {
  return {
    model: body.model,
    has_messages: Array.isArray(body.messages),
    message_count: Array.isArray(body.messages) ? body.messages.length : 0,
    has_input: Array.isArray(body.input),
    input_count: Array.isArray(body.input) ? body.input.length : 0,
    stream: body.stream,
    tool_count: Array.isArray(body.tools) ? body.tools.length : 0,
    top_level_keys: Object.keys(body).filter((key) => !CURSOR_ONLY_FIELDS.has(key))
  };
}

export function assertChatCompletionRequest(body: Record<string, unknown>): asserts body is ChatCompletionRequest {
  if (!Array.isArray(body.messages)) {
    throw new MissingMessagesError(Object.keys(body));
  }
}

export class MissingMessagesError extends Error {
  constructor(public readonly bodyKeys: string[]) {
    super("Chat completions request must include a messages array");
    this.name = "MissingMessagesError";
  }
}

function normalizeResponsesTools(tools: unknown): unknown[] {
  if (!Array.isArray(tools)) {
    return [];
  }

  const normalized: unknown[] = [];

  for (const tool of tools) {
    if (!isRecord(tool)) {
      continue;
    }

    if (tool.type === "function" && isRecord(tool.function)) {
      normalized.push({
        type: "function",
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
        ...(typeof tool.function.strict === "boolean" ? { strict: tool.function.strict } : {})
      });
      continue;
    }

    if (tool.type === "function" && typeof tool.name === "string") {
      normalized.push(tool);
      continue;
    }

    if (tool.type === "web_search" || tool.type === "web_search_preview") {
      normalized.push(tool);
    }
  }

  return normalized;
}

function normalizeResponsesToolChoice(toolChoice: unknown, hasTools: boolean): unknown {
  if (!hasTools || !toolChoice || toolChoice === "auto" || toolChoice === "required") {
    return undefined;
  }

  if (toolChoice === "none") {
    return "none";
  }

  if (isRecord(toolChoice) && toolChoice.type === "function") {
    if (typeof toolChoice.name === "string") {
      return { type: "function", name: toolChoice.name };
    }

    if (isRecord(toolChoice.function) && typeof toolChoice.function.name === "string") {
      return { type: "function", name: toolChoice.function.name };
    }
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
