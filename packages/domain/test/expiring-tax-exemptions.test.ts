import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import {
  createDatabase,
  withOrganizationContext,
  organizations,
  properties,
  units,
  taxExemptions,
  type Database,
} from "@farfalla/database";
import { getExpiringTaxExemptions } from "../src/accounting/expiring-tax-exemptions";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://farfalla:farfalla@localhost:5432/farfalla_test";
const MIGRATIONS_FOLDER = "../database/drizzle";

let db: Database;

beforeAll(async () => {
  db = createDatabase(TEST_DATABASE_URL);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE TABLE tax_exemptions, units, properties, organizations RESTART IDENTITY CASCADE`);
});

describe("getExpiringTaxExemptions (TAX-004)", () => {
  it("solo devuelve exoneraciones con vencimiento dentro de la ventana de días configurada", async () => {
    const organizationId = randomUUID();
    const { occupiedPropertyId, vacantPropertyId } = await withOrganizationContext(db, organizationId, async (tx) => {
      await tx.insert(organizations).values({ id: organizationId, name: "Org de prueba" });

      const [occupiedProperty] = await tx
        .insert(properties)
        .values({ organizationId, internalCode: "P-OCC", name: "Ocupada", propertyType: "apartamento" })
        .returning({ id: properties.id });
      await tx
        .insert(units)
        .values({ organizationId, propertyId: occupiedProperty!.id, unitCode: "1", unitType: "apartamento", occupancyStatus: "occupied" });

      const [vacantProperty] = await tx
        .insert(properties)
        .values({ organizationId, internalCode: "P-VAC", name: "Vacía", propertyType: "apartamento" })
        .returning({ id: properties.id });
      await tx
        .insert(units)
        .values({ organizationId, propertyId: vacantProperty!.id, unitCode: "1", unitType: "apartamento", occupancyStatus: "vacant" });

      await tx.insert(taxExemptions).values([
        {
          organizationId,
          propertyId: occupiedProperty!.id,
          taxType: "irpf",
          reason: "Vence pronto (ocupada)",
          validFrom: "2020-01-01",
          validTo: "2026-08-10", // dentro de la ventana de 30 días desde 2026-08-01
        },
        {
          organizationId,
          propertyId: vacantProperty!.id,
          taxType: "irpf",
          reason: "Vence pronto (vacía)",
          validFrom: "2020-01-01",
          validTo: "2026-08-15",
        },
        {
          organizationId,
          propertyId: occupiedProperty!.id,
          taxType: "irpf",
          reason: "Vence lejos",
          validFrom: "2020-01-01",
          validTo: "2027-01-01", // fuera de la ventana
        },
        {
          organizationId,
          propertyId: occupiedProperty!.id,
          taxType: "irpf",
          reason: "Sin fecha de fin",
          validFrom: "2020-01-01",
          // sin validTo — nunca "vence", no debe listarse
        },
      ]);

      return { occupiedPropertyId: occupiedProperty!.id, vacantPropertyId: vacantProperty!.id };
    });

    const all = await getExpiringTaxExemptions(db, {
      organizationId,
      daysAhead: 30,
      today: "2026-08-01",
    });
    expect(all).toHaveLength(2);
    expect(all.map((e) => e.reason).sort()).toEqual(["Vence pronto (ocupada)", "Vence pronto (vacía)"]);
    const occupiedRow = all.find((e) => e.propertyId === occupiedPropertyId);
    expect(occupiedRow?.daysUntilExpiration).toBe(9);

    const occupiedOnly = await getExpiringTaxExemptions(db, {
      organizationId,
      daysAhead: 30,
      occupiedOnly: true,
      today: "2026-08-01",
    });
    expect(occupiedOnly).toHaveLength(1);
    expect(occupiedOnly[0]?.propertyId).toBe(occupiedPropertyId);
    expect(occupiedOnly.some((e) => e.propertyId === vacantPropertyId)).toBe(false);
  });
});
