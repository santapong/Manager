import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    testTimeout: 20000,
    // Suites share one database — run files sequentially so cleanup in one
    // file can't race another file's seeds.
    fileParallelism: false,
  },
});
