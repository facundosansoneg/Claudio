import { PgBoss } from "pg-boss";
import { createDatabase } from "@farfalla/database";
import { HEARTBEAT_QUEUE, runHeartbeat } from "./jobs/heartbeat";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL no está definida");

  const db = createDatabase(connectionString);
  const boss = new PgBoss(connectionString);

  boss.on("error", (error: unknown) => console.error("[worker] error de pg-boss", error));

  await boss.start();
  await boss.createQueue(HEARTBEAT_QUEUE);
  await boss.work(HEARTBEAT_QUEUE, async () => {
    await runHeartbeat(db, "schedule");
  });

  console.log("[worker] iniciado, escuchando colas de pg-boss");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
