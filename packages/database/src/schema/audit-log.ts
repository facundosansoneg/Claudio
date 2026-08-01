import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

// Registra toda alta, modificación, aprobación, anulación, cierre,
// reversión, exportación y envío (spec, sección 17). Nunca se edita ni
// se borra una fila existente.
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  userId: uuid("user_id").references(() => users.id), // null = job/sistema
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ip_address"),
  sessionId: text("session_id"),
  correlationId: uuid("correlation_id").notNull().defaultRandom(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  action: text("action").notNull(),
  previousState: jsonb("previous_state"),
  newState: jsonb("new_state"),
  // Obligatorio para anulación, reversión, reapertura y modificación
  // fiscal (sección 17); opcional para altas simples.
  reason: text("reason"),
});
