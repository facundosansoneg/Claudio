import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

// Mapeo mínimo (sin RLS, a propósito) para resolver a qué organización
// pertenece un usuario que inicia sesión, ANTES de poder abrir el
// contexto de organización que exige la RLS del resto del esquema (ADR
// 0006). Solo expone IDs y el "oid" de Entra ID — ningún dato de
// negocio — así que el costo de no tener RLS acá es mínimo. Es el mismo
// tipo de excepción que ya tiene `permissions` (catálogo global).
//
// Flujo de login: 1) resolver organización acá por
// external_auth_subject: 2) abrir withOrganizationContext con esa
// organización: 3) recién ahí leer `users`, `user_scopes`, etc. bajo RLS.
export const userIdentities = pgTable(
  "user_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    externalAuthSubject: text("external_auth_subject").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("user_identities_external_auth_subject_idx").on(table.externalAuthSubject),
  ],
);
