import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CODEX_ORIGINATOR, DEFAULT_CODEX_UPSTREAM_URL, USER_AGENT } from "../src/constants";
import { chatCompletionsToResponsesRequest, collectChatCompletion } from "../src/transform";

async function main(): Promise<void> {
  const authPath = process.argv[2] ?? join(homedir(), ".codex/auth.json");
  const auth = JSON.parse(readFileSync(authPath, "utf8")) as Record<string, unknown>;
  const tokens = (auth.tokens ?? {}) as Record<string, unknown>;
  const idToken = (tokens.id_token ?? {}) as Record<string, unknown>;
  const accessToken = String(tokens.access_token ?? "");
  const accountId = String(
    idToken.chatgpt_account_id ?? tokens.account_id ?? auth.chatgpt_account_id ?? ""
  );

  if (!accessToken) {
    throw new Error(`No access_token found in ${authPath}`);
  }

  const body = chatCompletionsToResponsesRequest({
    model: "gpt-5.5",
    messages: [{ role: "user", content: "hi" }],
    stream: false
  });

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
    body: JSON.stringify(body)
  });

  console.log("status:", response.status);
  if (!response.ok || !response.body) {
    console.log("body_prefix:", (await response.text()).slice(0, 400));
    process.exit(1);
  }

  const completion = await collectChatCompletion(response.body, "gpt-5.5");
  console.log("reply:", completion.choices?.[0]?.message?.content ?? JSON.stringify(completion));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
