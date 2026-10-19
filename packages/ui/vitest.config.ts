import { defineConfig } from "vitest/config";

/**
 * The package's own unit tests. A shared component's behaviour is pinned here,
 * next to the component, rather than in one consumer app; `turbo run test`
 * runs it in CI with the other packages.
 */
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    // Default node; a component test opts into jsdom with a leading
    // `// @vitest-environment jsdom` comment.
    environment: "node",
  },
});
