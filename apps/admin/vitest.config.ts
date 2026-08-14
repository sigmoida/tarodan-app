import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Unit tests under `src/`. Mirrors apps/web/vitest.config.ts — same scoping
 * reason: without an explicit `include`, vitest would also try to collect
 * anything else under the app root and fail with "no test suite found".
 */
export default defineConfig({
  // .tsx tests don't import React explicitly — automatic JSX runtime, same
  // as Next's own setting.
  esbuild: { jsx: "automatic" },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    // Default node; a hook/component test opts into jsdom per-file with a
    // leading `// @vitest-environment jsdom` comment.
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
