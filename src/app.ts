import { handleOpenAICompatibleRequest } from "./openai-compatible";
import { handleDashboardRequest } from "./dashboard/router";
import { jsonError } from "./auth";
import { dashboardCors, v1Cors } from "./cors";
import type { RuntimeEnv } from "./env";

export default {
  async fetch(request: Request, env: RuntimeEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return v1Cors(Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } }));
    }

    if (url.pathname.startsWith("/api/")) {
      if (request.method === "OPTIONS") {
        return dashboardCors(request, new Response(null, { status: 204 }));
      }

      const dashboardResponse = await handleDashboardRequest(request, env, ctx);
      if (dashboardResponse) {
        return dashboardCors(request, dashboardResponse);
      }
    }

    if (url.pathname.startsWith("/v1/")) {
      return handleOpenAICompatibleRequest(request, env, ctx);
    }

    if (env.ASSETS) {
      const assetResponse = await env.ASSETS.fetch(request);
      if (assetResponse.status !== 404) {
        return assetResponse;
      }
    }

    if (url.pathname === "/" || !url.pathname.includes(".")) {
      if (env.ASSETS) {
        const spaResponse = await env.ASSETS.fetch(new Request(new URL("/index.html", url.origin), request));
        if (spaResponse.status !== 404) {
          return spaResponse;
        }
      }
    }

    return v1Cors(jsonError("Route not found", 404, "invalid_request_error", "not_found"));
  }
} satisfies ExportedHandler<RuntimeEnv>;
