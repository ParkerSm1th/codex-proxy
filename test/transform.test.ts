import { describe, expect, it } from "vitest";
import {
  chatCompletionsToResponsesRequest,
  collectChatCompletion,
  responsesSseToChatCompletionsStream
} from "../src/transform";

describe("OpenAI/Codex transforms", () => {
  it("converts chat completions bodies into Codex Responses bodies", () => {
    const body = chatCompletionsToResponsesRequest({
      model: "gpt-5.5-high",
      messages: [
        { role: "system", content: "Be precise." },
        { role: "user", content: "Hello" }
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "lookup",
            description: "Look something up",
            parameters: { type: "object" }
          }
        }
      ],
      tool_choice: "auto"
    });

    expect(body).toMatchObject({
      model: "gpt-5.5",
      instructions: "Be precise.",
      stream: true,
      store: false,
      reasoning: { effort: "high" }
    });
    expect(body.input).toEqual([
      { type: "message", role: "user", content: [{ type: "input_text", text: "Hello" }] }
    ]);
    expect(body.tools).toEqual([
      {
        type: "function",
        name: "lookup",
        description: "Look something up",
        parameters: { type: "object" }
      }
    ]);
  });

  it("streams Responses text deltas as chat completion chunks", async () => {
    const stream = responsesSseToChatCompletionsStream(
      streamFromString(
        [
          "event: response.output_text.delta",
          'data: {"type":"response.output_text.delta","delta":"Hel"}',
          "",
          "event: response.output_text.delta",
          'data: {"type":"response.output_text.delta","delta":"lo"}',
          "",
          "event: response.completed",
          'data: {"type":"response.completed","response":{"usage":{"input_tokens":1,"output_tokens":1}}}',
          "",
          ""
        ].join("\n")
      ),
      "gpt-5.5"
    );

    const text = await new Response(stream).text();

    expect(text).toContain('"role":"assistant"');
    expect(text).toContain('"content":"Hel"');
    expect(text).toContain('"content":"lo"');
    expect(text).toContain("data: [DONE]");
  });

  it("collects non-streaming completions from Responses SSE", async () => {
    const completion = await collectChatCompletion(
      streamFromString(
        [
          'data: {"type":"response.output_text.delta","delta":"Hi"}',
          "",
          'data: {"type":"response.completed","response":{"usage":{"input_tokens":2}}}',
          "",
          ""
        ].join("\n")
      ),
      "gpt-5.5"
    );

    expect(completion).toMatchObject({
      object: "chat.completion",
      choices: [{ message: { role: "assistant", content: "Hi" }, finish_reason: "stop" }],
      usage: { input_tokens: 2 }
    });
  });
});

function streamFromString(value: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(value));
      controller.close();
    }
  });
}
