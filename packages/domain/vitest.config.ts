import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    testTimeout: 20_000,
    // Varios archivos de test comparten una base Postgres real y truncan
    // tablas en afterAll; correrlos en paralelo produce condiciones de
    // carrera entre ellos (ver packages/database/vitest.config.ts).
    fileParallelism: false,
  },
});
