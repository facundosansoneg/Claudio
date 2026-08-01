import { date, integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { units } from "./properties";
import { tenants } from "./tenants";
import { parties } from "./parties";

// Contrato de arrendamiento (spec, sección 7.5, LEASE-001), versionado.
// Garantías, alquiler afianzado y reajustes se modelan en un tramo
// posterior (ver docs/implementation-plan.md, Hito 2 en curso).
export const leases = pgTable("leases", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  unitId: uuid("unit_id")
    .notNull()
    .references(() => units.id),
  leaseNumber: text("lease_number").notNull(),
  signDate: date("sign_date"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  extendedUntil: date("extended_until"),
  purpose: text("purpose").notNull().default("housing"), // housing, commerce, other
  currency: text("currency").notNull().default("UYU"),
  initialRent: numeric("initial_rent", { precision: 20, scale: 6 }).notNull(),
  frequency: text("frequency").notNull().default("monthly"),
  dueDay: integer("due_day"),
  commissionOnRentPercentage: numeric("commission_on_rent_percentage", {
    precision: 12,
    scale: 8,
  }),
  commissionOnConsumptionPercentage: numeric("commission_on_consumption_percentage", {
    precision: 12,
    scale: 8,
  }),
  // Referencia opcional a commission_concepts.code (COMM-001). Si está
  // seteado, la comisión de administración se calcula desde el
  // catálogo (con overrides por propietario, mínimo/máximo e IVA); si
  // no, se usa la negociación puntual de commission_on_rent_percentage
  // como hasta ahora.
  commissionConceptCode: text("commission_concept_code"),
  status: text("status").notNull().default("active"), // draft, active, terminated, expired
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by"),
});

// Inquilinos, garantes y coarrendatarios de un contrato (spec, sección 7.5).
export const leaseParties = pgTable("lease_parties", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  leaseId: uuid("lease_id")
    .notNull()
    .references(() => leases.id),
  partyId: uuid("party_id")
    .notNull()
    .references(() => parties.id),
  tenantId: uuid("tenant_id").references(() => tenants.id),
  role: text("role").notNull(), // tenant, guarantor, co_tenant
  responsibilityPercentage: numeric("responsibility_percentage", { precision: 12, scale: 8 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
});
