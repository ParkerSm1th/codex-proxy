import { createServer } from "node:http";

const target = process.env.CODEX_TARGET_URL ?? "https://chatgpt.com/backend-api/codex/responses";
const port = Number(process.env.PORT ?? 8790);

createServer(async (request, response) => {
  if (request.method !== "POST") {
    response.writeHead(405, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const body = await readBody(request);
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (!value || key === "host" || key === "content-length" || key === "connection") {
      continue;
    }
    if (key.startsWith("cf-") || key === "cdn-loop") {
      continue;
    }
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }

  const upstream = await fetch(target, {
    method: "POST",
    headers,
    body
  });

  response.writeHead(upstream.status, {
    "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
    "Cache-Control": "no-store"
  });

  if (upstream.body) {
    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      response.write(Buffer.from(value));
    }
  }

  response.end();
}).listen(port, "127.0.0.1", () => {
  console.log(`Codex upstream relay listening on http://127.0.0.1:${port}`);
  console.log(`Forwarding to ${target}`);
});

function readBody(request: import("node:http").IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}
