import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Tests hit a real Postgres + Redis (docker-compose) and share
    // module-level connection pools/in-memory maps (e.g. the signaling
    // module's connection registry) — run serially within a file and
    // across files to avoid cross-test interference and connection
    // pool exhaustion against a small local Postgres instance.
    fileParallelism: false,
    testTimeout: 20000,
    setupFiles: ["./tests/setup.ts"],
  },
});
