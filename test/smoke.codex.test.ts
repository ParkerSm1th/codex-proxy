import { describe, expect, it } from "vitest";

const runSmoke = process.env.RUN_CODEX_SMOKE === "1";

describe.skipIf(!runSmoke)("deployed Codex proxy smoke", () => {
  it("verifies the deployed /v1/models endpoint with a real proxy key", async () => {
    const baseUrl = process.env.CODEX_PROXY_BASE_URL;
    const apiKey = process.env.CODEX_PROXY_API_KEY;

    if (!baseUrl || !apiKey) {
      throw new Error("CODEX_PROXY_BASE_URL and CODEX_PROXY_API_KEY are required for the smoke test");
    }

    const response = await fetch(`${baseUrl.replace(/\/$/u, "")}/v1/models`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ object: "list" });
  });
});
