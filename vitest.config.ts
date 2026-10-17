import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    setupFiles: ["tests/fixture.ts"],
    fileParallelism: false,
    maxWorkers: 1,
  },
});
