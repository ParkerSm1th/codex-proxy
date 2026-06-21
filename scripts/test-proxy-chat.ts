const baseUrl = (process.env.CODEX_PROXY_BASE_URL ?? "http://127.0.0.1:8788").replace(/\/$/u, "");
const apiKey = process.env.CODEX_PROXY_API_KEY;

if (!apiKey) {
  console.error("CODEX_PROXY_API_KEY is required");
  process.exit(1);
}

console.log("fetching from", `${baseUrl}/v1/chat/completions`);
const response = await fetch(`${baseUrl}/v1/chat/completions`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model: "gpt-5.5",
    messages: [{ role: "user", content: "who are you" }],
    stream: false
  })
});

console.log("status:", response.status);

if (!response.ok) {
  console.log("body_prefix:", (await response.text()).slice(0, 500));
  process.exit(1);
}

const completion = (await response.json()) as {
  choices?: Array<{ message?: { content?: string } }>;
};

console.log("reply:", completion.choices?.[0]?.message?.content ?? JSON.stringify(completion));
