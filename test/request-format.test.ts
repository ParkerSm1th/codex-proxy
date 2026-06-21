import { describe, expect, it } from "vitest";
import {
  isResponsesShapedChatRequest,
  normalizeCursorResponsesBody,
  summarizeRequestBody
} from "../src/request-format";

describe("request format detection", () => {
  it("detects Cursor responses payloads sent to chat completions", () => {
    expect(
      isResponsesShapedChatRequest({
        model: "gpt-5.5",
        input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] }]
      })
    ).toBe(true);
  });

  it("does not treat standard chat completions bodies as responses payloads", () => {
    expect(
      isResponsesShapedChatRequest({
        model: "gpt-5.5",
        messages: [{ role: "user", content: "hi" }]
      })
    ).toBe(false);
  });

  it("maps gpt-5.5-extra to upstream gpt-5.5 with xhigh reasoning", () => {
    const body = normalizeCursorResponsesBody({
      model: "gpt-5.5-extra",
      input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] }]
    });

    expect(body).toMatchObject({
      model: "gpt-5.5",
      reasoning: { effort: "xhigh" }
    });
  });

  it("normalizes Cursor responses payloads for Codex upstream", () => {
    const body = normalizeCursorResponsesBody({
      model: "gpt-5.5-high",
      input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] }],
      instructions: "Be helpful.",
      stream: true,
      include: ["reasoning.encrypted_content"],
      tools: [
        { type: "function", name: "Shell", parameters: { type: "object" } },
        { type: "custom", name: "ApplyPatch" }
      ],
      reasoning: { effort: "high", summary: "auto" },
      service_tier: "priority"
    });

    expect(body).toMatchObject({
      model: "gpt-5.5",
      instructions: "Be helpful.",
      stream: true,
      store: false,
      reasoning: { effort: "high", summary: "auto" },
      service_tier: "priority"
    });
    expect(body.tools).toEqual([{ type: "function", name: "Shell", parameters: { type: "object" } }]);
    expect(body).not.toHaveProperty("include");
  });

  it("adds default instructions when Cursor omits them", () => {
    const body = normalizeCursorResponsesBody({
      model: "gpt-5.5",
      input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] }]
    });

    expect(body.instructions).toBe("You are a helpful assistant.");
  });

  it("drops unsupported Cursor fields like metadata", () => {
    const body = normalizeCursorResponsesBody({
      model: "gpt-5.5",
      input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] }],
      metadata: { cursor: true }
    });

    expect(body).not.toHaveProperty("metadata");
  });

  it("summarizes request bodies for observability logs", () => {
    expect(
      summarizeRequestBody({
        model: "gpt-5.5",
        input: [{ type: "message" }],
        tools: [{ type: "function", name: "Shell" }]
      })
    ).toMatchObject({
      model: "gpt-5.5",
      has_input: true,
      input_count: 1,
      has_messages: false,
      tool_count: 1
    });
  });
});
