import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  server: {
    port: 3000,
    proxy: {
      "/api": "http://127.0.0.1:8788",
      "/v1": "http://127.0.0.1:8788"
    }
  },
  plugins: [
    tsconfigPaths(),
    tailwindcss(),
    tanstackStart({
      spa: {
        enabled: true
      }
    }),
    viteReact()
  ]
});
