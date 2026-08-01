import { date, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { parties } from "./parties";

// Usuario interno (staff de la organización administradora). El rol
// "Propietario externo" (ADR 0002) no usa esta tabla: es una identidad
// separada atada 1:1 a un party propietario, servida desde un portal
// aislado — se modela en un hito posterior junto al portal.
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  partyId: uuid("party_id").references(() => parties.id),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by"),
}, (table) => [uniqueIndex("users_organization_id_email_idx").on(table.organizationId, table.email)]);

// Los 9 roles mínimos de la sección 5.2 se siembran por organización
// (seed en packages/auth/src/seed-roles.ts) para permitir extensión
// futura sin romper el modelo RBAC.
export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  code: text("code").notNull(), // system_admin, portfolio_director, property_manager, treasury, accounting_tax, operator, viewer, external_owner, auditor
  name: text("name").notNull(),
  isSystemDefined: text("is_system_defined").notNull().default("true"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("roles_organization_id_code_idx").on(table.organizationId, table.code)]);

// Catálogo global de acciones (spec, sección 5.3). No lleva
// organization_id: es la taxonomía fija de acciones, no un dato de
// tenant.
export const permissions = pgTable("permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  resource: text("resource").notNull(), // owner, property, lease, charge, payment, receipt, accounting_period, ...
  action: text("action").notNull(), // view, create, edit_draft, confirm, approve, revert, reopen_period, export, send_communication
  description: text("description"),
}, (table) => [uniqueIndex("permissions_resource_action_idx").on(table.resource, table.action)]);

export const rolePermissions = pgTable("role_permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  roleId: uuid("role_id")
    .notNull()
    .references(() => roles.id),
  permissionId: uuid("permission_id")
    .notNull()
    .references(() => permissions.id),
  validFrom: date("valid_from").notNull().defaultNow(),
  validTo: date("valid_to"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
});

// Restringe un usuario a un alcance específico (familia, entidad,
// portafolio o propiedad) con un rol dado y vigencia (sección 5.3, 3.1).
export const userScopes = pgTable("user_scopes", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  roleId: uuid("role_id")
    .notNull()
    .references(() => roles.id),
  scopeType: text("scope_type").notNull(), // organization, family, party, property
  scopeId: uuid("scope_id"), // null cuando scope_type = organization
  validFrom: date("valid_from").notNull().defaultNow(),
  validTo: date("valid_to"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
});
