import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

// Trazabilidad de jobs en segundo plano (spec, sección 15): cada
// ejecución registra inicio, fin, parámetros, resultado, errores,
// reintentos y quién/qué la originó — independiente del detalle interno
// de pg-boss (ADR 0004), para que la auditoría funcional no dependa de
// una librería de cola concreta.
//
// organization_id es nullable a propósito: algunos jobs son
// multi-organización por naturaleza (ej. actualización de tipo de
// cambio/UI) y no pertenecen a un solo tenant. Por eso esta tabla no
// lleva RLS — es una tabla operativa, no un dato de negocio expuesto a
// usuarios de un tenant.
export const jobRuns = pgTable("job_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobName: text("job_name").notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: text("status").notNull().default("running"), // running, succeeded, failed
  params: jsonb("params"),
  result: jsonb("result"),
  error: text("error"),
  retryCount: integer("retry_count").notNull().default(0),
  // id de usuario, o "schedule"/nombre de la regla que originó el job.
  triggeredBy: text("triggered_by").notNull(),
});
