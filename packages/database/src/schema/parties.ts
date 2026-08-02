import { boolean, date, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const partyTypeEnum = pgEnum("party_type", [
  "person",
  "company",
  "trust",
  "government_agency",
  "other",
]);

// Modelo unificado de personas y entidades (spec, sección 7.1).
// Propietarios, inquilinos, garantes y proveedores son roles sobre una
// party, no entidades separadas — evita duplicar personas (ver
// docs/domain-model.md, "Notas de normalización").
export const parties = pgTable("parties", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  partyType: partyTypeEnum("party_type").notNull(),
  displayName: text("display_name").notNull(),
  legalName: text("legal_name"),
  documentType: text("document_type"),
  documentNumber: text("document_number"),
  taxResidency: text("tax_residency"),
  isLegalPerson: boolean("is_legal_person").notNull().default(false),
  birthOrIncorporationDate: date("birth_or_incorporation_date"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by"),
});

export const partyContacts = pgTable("party_contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  partyId: uuid("party_id")
    .notNull()
    .references(() => parties.id),
  contactType: text("contact_type").notNull(), // email, phone, address
  value: text("value").notNull(),
  isPreferred: boolean("is_preferred").notNull().default(false),
  validFrom: date("valid_from").notNull().defaultNow(),
  validTo: date("valid_to"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
});
