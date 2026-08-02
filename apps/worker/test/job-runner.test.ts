import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PgBoss } from "pg-boss";
import { eq, sql } from "drizzle-orm";
import { createDatabase, jobRuns, type Database } from "@farfalla/database";
import { HEARTBEAT_QUEUE, runHeartbeat } from "../src/jobs/heartbeat";
import { runTracked } from "../src/job-runner";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://farfalla:farfalla@localhost:5432/farfalla_test";

let db: Database;
let boss: PgBoss;

beforeAll(async () => {
  db = createDatabase(TEST_DATABASE_URL);
  boss = new PgBoss(TEST_DATABASE_URL);
  await boss.start();
});

afterAll(async () => {
  await boss.stop({ graceful: false, wait: false });
  await db.execute(sql`TRUNCATE TABLE job_runs RESTART IDENTITY CASCADE`);
});

describe("runTracked", () => {
  it("registra éxito en job_runs con inicio, fin y resultado", async () => {
    const result = await runTracked(db, "test.sample-success", { triggeredBy: "test" }, async () => {
      return { ok: true };
    });
    expect(result).toEqual({ ok: true });

    const [run] = await db.select().from(jobRuns).where(eq(jobRuns.jobName, "test.sample-success"));
    expect(run?.status).toBe("succeeded");
    expect(run?.finishedAt).not.toBeNull();
    expect(run?.result).toEqual({ ok: true });
  });

  it("registra el error y re-lanza la excepción cuando el job falla", async () => {
    await expect(
      runTracked(db, "test.sample-failure", { triggeredBy: "test" }, async () => {
        throw new Error("fallo simulado");
      }),
    ).rejects.toThrow("fallo simulado");

    const [run] = await db.select().from(jobRuns).where(eq(jobRuns.jobName, "test.sample-failure"));
    expect(run?.status).toBe("failed");
    expect(run?.error).toBe("fallo simulado");
  });
});

describe("integración con pg-boss (ADR 0004)", () => {
  it("procesa un heartbeat encolado y lo registra en job_runs", async () => {
    await boss.createQueue(HEARTBEAT_QUEUE);

    const processed = new Promise<void>((resolve, reject) => {
      boss
        .work(HEARTBEAT_QUEUE, async () => {
          await runHeartbeat(db, "test-schedule");
          resolve();
        })
        .catch(reject);
    });

    await boss.send(HEARTBEAT_QUEUE, {});
    await processed;
    await boss.offWork(HEARTBEAT_QUEUE);

    const [run] = await db.select().from(jobRuns).where(eq(jobRuns.jobName, HEARTBEAT_QUEUE));
    expect(run?.status).toBe("succeeded");
    expect(run?.triggeredBy).toBe("test-schedule");
  });
});
