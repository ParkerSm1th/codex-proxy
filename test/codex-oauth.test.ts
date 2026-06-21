import { describe, expect, it } from "vitest";
import { parseCallbackUrl } from "../src/dashboard/codex-oauth";
import { DashboardError } from "../src/dashboard/service";

describe("parseCallbackUrl", () => {
  it("parses a full localhost callback URL", () => {
    const url = parseCallbackUrl(
      "http://localhost:1455/auth/callback?code=abc123&state=xyz789"
    );
    expect(url.pathname).toBe("/auth/callback");
    expect(url.searchParams.get("code")).toBe("abc123");
    expect(url.searchParams.get("state")).toBe("xyz789");
  });

  it("parses a path-only callback URL", () => {
    const url = parseCallbackUrl("/auth/callback?code=abc123&state=xyz789");
    expect(url.hostname).toBe("localhost");
    expect(url.port).toBe("1455");
    expect(url.searchParams.get("code")).toBe("abc123");
  });

  it("rejects empty input", () => {
    expect(() => parseCallbackUrl("   ")).toThrow(DashboardError);
  });
});
