import { PgBoss } from "pg-boss";
import { createDatabase } from "@farfalla/database";
import { HEARTBEAT_QUEUE, runHeartbeat } from "./jobs/heartbeat";
import { GENERATE_MONTHLY_CHARGES_QUEUE, runGenerateMonthlyCharges } from "./jobs/generate-monthly-charges";
import { EXPIRING_CONTROLS_QUEUE, runExpiringControls } from "./jobs/expiring-controls";

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

  // Spec, sección 15: "generación mensual de cargos" y "control de
  // vencimientos". Ambos son idempotentes (generateMonthlyCharges por
  // contrato+período, getAlertsCenter es de solo lectura), así que un
  // reintento o una corrida manual de más nunca duplica ni corrompe
  // datos. Ninguno de los dos tiene un `boss.schedule` automático
  // todavía: harían falta "todas las organizaciones activas", y
  // `organizations` tiene RLS forzada comparando contra su propio id
  // (packages/database/drizzle/0001_enable_row_level_security.sql) —
  // no hay forma de enumerar tenants con el rol de aplicación normal, a
  // propósito (ADR 0006). Un rol de sistema con BYPASSRLS dedicado
  // *solo* a ese directorio es la solución, pero es una decisión de
  // infraestructura real que no se toma calladamente acá. Mientras
  // tanto, cada organización encola su propia corrida con
  // `boss.send(QUEUE, { organizationId })`.
  await boss.createQueue(GENERATE_MONTHLY_CHARGES_QUEUE);
  await boss.work<{ organizationId: string; period?: string }>(GENERATE_MONTHLY_CHARGES_QUEUE, async ([job]) => {
    await runGenerateMonthlyCharges(db, "schedule", job!.data.organizationId, job!.data.period);
  });

  await boss.createQueue(EXPIRING_CONTROLS_QUEUE);
  await boss.work<{ organizationId: string; daysAhead?: number }>(EXPIRING_CONTROLS_QUEUE, async ([job]) => {
    await runExpiringControls(db, "schedule", job!.data.organizationId, job!.data.daysAhead);
  });

  console.log("[worker] iniciado, escuchando colas de pg-boss");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
