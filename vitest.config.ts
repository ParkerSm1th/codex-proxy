import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
    alias: {
      "cloudflare:workers": new URL("./test/cloudflare-workers-mock.ts", import.meta.url).pathname
    }
  }
});
