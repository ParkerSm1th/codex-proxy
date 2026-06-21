import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CODEX_ORIGINATOR, DEFAULT_CODEX_UPSTREAM_URL, USER_AGENT } from "../src/constants";
import { normalizeCursorResponsesBody } from "../src/request-format";

const cursorLikeBody = {
  model: "gpt-5.5",
  input: [
    {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "hi" }]
    }
  ],
  stream: true,
  include: ["reasoning.encrypted_content"],
  reasoning: { effort: "medium", summary: "auto" },
  text: { verbosity: "low" },
  stream_options: { include_usage: true },
  tools: [
    {
      type: "function",
      name: "Shell",
      description: "Run a shell command",
      parameters: { type: "object", properties: {} }
    },
    {
      type: "custom",
      name: "ApplyPatch",
      description: "Apply a patch"
    }
  ],
  tool_choice: "auto",
  parallel_tool_calls: true
};

async function main(): Promise<void> {
  const authPath = process.argv[2] ?? join(homedir(), ".codex/auth.json");
  const auth = JSON.parse(readFileSync(authPath, "utf8")) as Record<string, unknown>;
  const tokens = (auth.tokens ?? {}) as Record<string, unknown>;
  const idToken = (tokens.id_token ?? {}) as Record<string, unknown>;
  const accessToken = String(tokens.access_token ?? "");
  const accountId = String(
    idToken.chatgpt_account_id ?? tokens.account_id ?? auth.chatgpt_account_id ?? ""
  );

  const variants = [
    { label: "cursor_raw", body: cursorLikeBody },
    { label: "normalized", body: normalizeCursorResponsesBody(cursorLikeBody) },
    {
      label: "normalized_no_reasoning_summary",
      body: {
        ...normalizeCursorResponsesBody(cursorLikeBody),
        reasoning: { effort: "medium" }
      }
    },
    {
      label: "minimal",
      body: {
        model: "gpt-5.5",
        instructions: "You are a helpful assistant.",
        input: cursorLikeBody.input,
        stream: true,
        store: false
      }
    }
  ];

  for (const variant of variants) {
    const response = await fetch(DEFAULT_CODEX_UPSTREAM_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        originator: CODEX_ORIGINATOR,
        session_id: crypto.randomUUID(),
        "User-Agent": USER_AGENT,
        ...(accountId ? { "ChatGPT-Account-Id": accountId } : {})
      },
      body: JSON.stringify(variant.body)
    });

    const text = await response.text();
    console.log(`\n=== ${variant.label} ===`);
    console.log("status:", response.status);
    console.log("body_prefix:", text.slice(0, 500));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
