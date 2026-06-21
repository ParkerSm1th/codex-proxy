import { createServer } from "node:http";

const target = process.env.CODEX_TARGET_URL ?? "https://chatgpt.com/backend-api/codex/responses";
const port = Number(process.env.PORT ?? 8790);
const relayToken = process.env.UPSTREAM_RELAY_TOKEN?.trim();

createServer(async (request, response) => {
  if (request.method === "GET" && (request.url === "/health" || request.url === "/")) {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (relayToken) {
    const provided = request.headers["x-relay-token"];
    const tokenValue = Array.isArray(provided) ? provided[0] : provided;
    if (tokenValue !== relayToken) {
      response.writeHead(401, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
  }

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
    if (key.startsWith("cf-") || key === "cdn-loop" || key === "x-relay-token") {
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
}).listen(port, "0.0.0.0", () => {
  console.log(`Codex upstream relay listening on 0.0.0.0:${port}`);
  console.log(`Forwarding to ${target}`);
  if (relayToken) {
    console.log("Relay token authentication is enabled (X-Relay-Token required)");
  } else {
    console.warn("WARNING: UPSTREAM_RELAY_TOKEN is not set — relay accepts unauthenticated requests");
  }
});

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}
