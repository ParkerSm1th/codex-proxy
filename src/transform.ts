import { normalizeModel } from "./models";
import { MissingMessagesError } from "./request-format";
import type { ChatCompletionMessage, ChatCompletionRequest } from "./types";

interface ResponsesRequest {
  model: string;
  instructions?: string;
  input: unknown[];
  stream: true;
  store: false;
  tools?: unknown[];
  tool_choice?: unknown;
  parallel_tool_calls?: boolean;
  reasoning?: unknown;
}

interface ResponsesSseEvent {
  type: string;
  payload: Record<string, unknown>;
}

export function chatCompletionsToResponsesRequest(request: ChatCompletionRequest): ResponsesRequest {
  if (!Array.isArray(request.messages)) {
    throw new MissingMessagesError(Object.keys(request));
  }

  const model = normalizeModel(request.model);
  const instructions = collectInstructions(request.messages);
  const input = request.messages.filter(isInputMessage).map(messageToResponsesInput);
  const body: ResponsesRequest = {
    model: model.upstream,
    instructions: instructions || "You are a helpful assistant.",
    input,
    stream: true,
    store: false
  };

  const tools = convertTools(request.tools);
  if (tools.length > 0) {
    body.tools = tools;
  }

  const toolChoice = convertToolChoice(request.tool_choice);
  if (toolChoice === "none") {
    body.tools = [];
  } else if (toolChoice) {
    body.tool_choice = toolChoice;
  }

  if (typeof request.parallel_tool_calls === "boolean") {
    body.parallel_tool_calls = request.parallel_tool_calls;
  }

  if (request.reasoning) {
    body.reasoning = request.reasoning;
  } else if (model.reasoningEffort) {
    body.reasoning = { effort: model.reasoningEffort };
  }

  return body;
}

function collectInstructions(messages: ChatCompletionMessage[]): string {
  return messages
    .filter((message) => message.role === "system" || message.role === "developer")
    .map((message) => stringifyContent(message.content))
    .filter(Boolean)
    .join("\n\n");
}

function isInputMessage(message: ChatCompletionMessage): boolean {
  return message.role !== "system" && message.role !== "developer";
}

function messageToResponsesInput(message: ChatCompletionMessage): Record<string, unknown> {
  if (message.role === "tool") {
    return {
      type: "function_call_output",
      call_id: message.tool_call_id,
      output: stringifyContent(message.content)
    };
  }

  const input: Record<string, unknown> = {
    type: "message",
    role: message.role === "assistant" ? "assistant" : "user",
    content: convertContent(message.content)
  };

  if (message.name) {
    input.name = message.name;
  }

  if (message.tool_calls) {
    input.tool_calls = message.tool_calls;
  }

  return input;
}

function convertContent(content: unknown): unknown[] {
  if (content == null) {
    return [];
  }

  if (typeof content === "string") {
    return [{ type: "input_text", text: content }];
  }

  if (!Array.isArray(content)) {
    return [{ type: "input_text", text: stringifyContent(content) }];
  }

  return content.map((part) => {
    if (!isRecord(part)) {
      return { type: "input_text", text: String(part) };
    }

    if (part.type === "text") {
      return { type: "input_text", text: String(part.text ?? "") };
    }

    if (part.type === "image_url" && isRecord(part.image_url)) {
      return { type: "input_image", image_url: part.image_url.url };
    }

    return part;
  });
}

function stringifyContent(content: unknown): string {
  if (content == null) {
    return "";
  }

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map(stringifyContent).filter(Boolean).join("\n");
  }

  if (isRecord(content) && typeof content.text === "string") {
    return content.text;
  }

  return JSON.stringify(content);
}

function convertTools(tools: unknown): unknown[] {
  if (!Array.isArray(tools)) {
    return [];
  }

  return tools.map((tool) => {
    if (!isRecord(tool) || tool.type !== "function" || !isRecord(tool.function)) {
      return tool;
    }

    const converted: Record<string, unknown> = {
      type: "function",
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters
    };

    if (typeof tool.function.strict === "boolean") {
      converted.strict = tool.function.strict;
    }

    return converted;
  });
}

function convertToolChoice(toolChoice: unknown): unknown {
  if (!toolChoice || toolChoice === "auto" || toolChoice === "required") {
    return undefined;
  }

  if (toolChoice === "none") {
    return "none";
  }

  if (isRecord(toolChoice) && toolChoice.type === "function" && isRecord(toolChoice.function)) {
    return { type: "function", name: toolChoice.function.name };
  }

  return undefined;
}

export function responsesSseToChatCompletionsStream(
  body: ReadableStream<Uint8Array>,
  model: string,
  onCompleted?: (usage: TokenUsage | null) => void
): ReadableStream<Uint8Array> {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();

  void (async () => {
    const writer = writable.getWriter();
    const id = `chatcmpl_${crypto.randomUUID()}`;
    const created = Math.floor(Date.now() / 1000);

    try {
      await writer.write(encodeSse(chatChunk(id, model, created, { role: "assistant" })));

      for await (const event of readResponsesSseEvents(body)) {
        for (const chunk of eventToChatChunks(event, id, model, created)) {
          await writer.write(encodeSse(chunk));
        }

        if (event.type === "response.completed") {
          onCompleted?.(parseUsage(event.payload));
          await writer.write(encodeSse("[DONE]"));
        }
      }
    } catch (error) {
      await writer.write(
        encodeSse({
          error: {
            message: error instanceof Error ? error.message : "Failed to transform Codex stream",
            type: "upstream_stream_error"
          }
        })
      );
      await writer.write(encodeSse("[DONE]"));
    } finally {
      await writer.close();
    }
  })();

  return readable;
}

export async function collectChatCompletion(body: ReadableStream<Uint8Array>, model: string): Promise<unknown> {
  let content = "";
  let finishReason = "stop";
  let usage: unknown;
  const id = `chatcmpl_${crypto.randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);

  for await (const event of readResponsesSseEvents(body)) {
    if (event.type === "response.output_text.delta" && typeof event.payload.delta === "string") {
      content += event.payload.delta;
    }

    if (event.type === "response.failed") {
      finishReason = "error";
    }

    if (event.type === "response.completed") {
      usage = extractUsage(event.payload);
    }
  }

  return {
    id,
    object: "chat.completion",
    created,
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: finishReason
      }
    ],
    usage
  };
}

export async function* readResponsesSseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<ResponsesSseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventName = "";
  let dataLines: string[] = [];

  const dispatch = function* (): Generator<ResponsesSseEvent> {
    if (dataLines.length === 0) {
      eventName = "";
      return;
    }

    const data = dataLines.join("\n");
    dataLines = [];

    if (data === "[DONE]") {
      eventName = "";
      return;
    }

    const payload = JSON.parse(data) as Record<string, unknown>;
    const type = eventName || (typeof payload.type === "string" ? payload.type : "");
    eventName = "";

    if (type) {
      yield { type, payload };
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/u);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line === "") {
        yield* dispatch();
      } else if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      }
    }
  }

  buffer += decoder.decode();
  if (buffer.length > 0) {
    if (buffer.startsWith("data:")) {
      dataLines.push(buffer.slice(5).trimStart());
    }
    buffer = "";
  }

  yield* dispatch();
}

function eventToChatChunks(
  event: ResponsesSseEvent,
  id: string,
  model: string,
  created: number
): Array<Record<string, unknown>> {
  if (event.type === "response.output_text.delta" && typeof event.payload.delta === "string") {
    return [chatChunk(id, model, created, { content: event.payload.delta })];
  }

  if (event.type === "response.function_call_arguments.delta" && typeof event.payload.delta === "string") {
    return [
      chatChunk(id, model, created, {
        tool_calls: [
          {
            index: Number(event.payload.output_index ?? 0),
            function: { arguments: event.payload.delta }
          }
        ]
      })
    ];
  }

  if (event.type === "response.output_item.done" && isRecord(event.payload.item)) {
    const item = event.payload.item;
    if (item.type === "function_call") {
      return [
        chatChunk(id, model, created, {
          tool_calls: [
            {
              index: Number(event.payload.output_index ?? 0),
              id: item.call_id ?? item.id,
              type: "function",
              function: {
                name: item.name,
                arguments: item.arguments ?? ""
              }
            }
          ]
        })
      ];
    }
  }

  if (event.type === "response.completed") {
    return [
      chatChunk(id, model, created, {}, "stop", extractUsage(event.payload))
    ];
  }

  if (event.type === "response.failed") {
    return [
      {
        error: {
          message: extractFailureMessage(event.payload),
          type: "upstream_error"
        }
      }
    ];
  }

  return [];
}

function chatChunk(
  id: string,
  model: string,
  created: number,
  delta: Record<string, unknown>,
  finishReason?: string,
  usage?: unknown
): Record<string, unknown> {
  const choice: Record<string, unknown> = {
    index: 0,
    delta,
    finish_reason: finishReason ?? null
  };
  const chunk: Record<string, unknown> = {
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [choice]
  };

  if (usage) {
    chunk.usage = usage;
  }

  return chunk;
}

function extractUsage(payload: Record<string, unknown>): unknown {
  if (isRecord(payload.response) && payload.response.usage) {
    return payload.response.usage;
  }

  return payload.usage;
}

export interface TokenUsage {
  input_tokens?: number;
  output_tokens?: number;
}

export function parseUsage(payload: Record<string, unknown>): TokenUsage | null {
  const usage = extractUsage(payload);
  if (!isRecord(usage)) {
    return null;
  }

  return {
    input_tokens: typeof usage.input_tokens === "number" ? usage.input_tokens : undefined,
    output_tokens: typeof usage.output_tokens === "number" ? usage.output_tokens : undefined
  };
}

function extractFailureMessage(payload: Record<string, unknown>): string {
  if (isRecord(payload.error) && typeof payload.error.message === "string") {
    return payload.error.message;
  }

  if (typeof payload.message === "string") {
    return payload.message;
  }

  return "Codex upstream failed";
}

function encodeSse(data: unknown): Uint8Array {
  const value = data === "[DONE]" ? "[DONE]" : JSON.stringify(data);
  return new TextEncoder().encode(`data: ${value}\n\n`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
