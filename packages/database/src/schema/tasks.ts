import { date, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { properties, units } from "./properties";
import { leases } from "./leases";
import { owners } from "./owners";
import { tenants } from "./tenants";
import { users } from "./users";

// Tarea (spec, sección 11.1). Vinculación opcional a propiedad, unidad,
// contrato, propietario o inquilino — FKs nullable en vez de una
// relación polimórfica genérica, mismo patrón que journal_lines
// (packages/database/src/schema/accounting.ts). El checklist es texto
// libre en JSON (lista de {text, done}): todavía no hay un catálogo de
// plantillas de checklist por tipo de tarea (CLAUDE.md regla 6, se
// agrega cuando haya un caso real). Los archivos adjuntos y el
// historial completo quedan para un tramo posterior — el historial
// básico (alta, cambios de estado) ya quedó cubierto por audit_log.
export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  title: text("title").notNull(),
  description: text("description"),
  taskType: text("task_type").notNull().default("general"), // general, mantenimiento, cobranza, administrativa...
  priority: text("priority").notNull().default("medium"), // low, medium, high, urgent
  assignedTo: uuid("assigned_to").references(() => users.id),
  dueDate: date("due_date"),
  propertyId: uuid("property_id").references(() => properties.id),
  unitId: uuid("unit_id").references(() => units.id),
  leaseId: uuid("lease_id").references(() => leases.id),
  ownerId: uuid("owner_id").references(() => owners.id),
  tenantId: uuid("tenant_id").references(() => tenants.id),
  checklist: jsonb("checklist"), // [{ text: string, done: boolean }]
  status: text("status").notNull().default("open"), // open, in_progress, done, cancelled
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by"),
});

// Comentarios de una tarea (spec, sección 11.1, "comentarios").
export const taskComments = pgTable("task_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.id),
  authorId: uuid("author_id").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
