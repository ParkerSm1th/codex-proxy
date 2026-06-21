const DEFAULT_V1_METHODS = "GET, POST, OPTIONS";
const DEFAULT_V1_HEADERS = "Authorization, Content-Type";

export function v1Cors(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Headers", DEFAULT_V1_HEADERS);
  headers.set("Access-Control-Allow-Methods", DEFAULT_V1_METHODS);
  headers.set("Access-Control-Expose-Headers", "X-Request-Id");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export function dashboardCors(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  const origin = request.headers.get("Origin");
  const requestOrigin = new URL(request.url).origin;

  if (origin && origin === requestOrigin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  }

  return new Response(response.body, { status: response.status, headers });
}
