import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    testTimeout: 20_000,
    // Los tests comparten una base Postgres real y truncan tablas en
    // afterAll; correr archivos en paralelo produce condiciones de
    // carrera entre ellos.
    fileParallelism: false,
  },
});
