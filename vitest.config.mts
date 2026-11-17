import { defineConfig } from "vitest/config";

// Convex functions run on the edge runtime, so the tests do too.
export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: ["tests/**/*.test.ts"],
    server: { deps: { inline: ["convex-test"] } },
  },
});
