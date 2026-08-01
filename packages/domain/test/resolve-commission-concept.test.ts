import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import {
  createDatabase,
  withOrganizationContext,
  organizations,
  parties,
  owners,
  commissionConcepts,
  commissionConceptOverrides,
  type Database,
} from "@farfalla/database";
import { resolveCommissionConcept } from "../src/accounting/resolve-commission-concept";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://farfalla:farfalla@localhost:5432/farfalla_test";
const MIGRATIONS_FOLDER = "../database/drizzle";

let db: Database;

beforeAll(async () => {
  db = createDatabase(TEST_DATABASE_URL);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
});

afterAll(async () => {
  await db.execute(
    sql`TRUNCATE TABLE commission_concept_overrides, commission_concepts, owners, parties, organizations RESTART IDENTITY CASCADE`,
  );
});

describe("resolveCommissionConcept (COMM-001/002)", () => {
  it("usa el concepto base cuando el propietario no tiene override", async () => {
    const organizationId = randomUUID();
    const { ownerId } = await withOrganizationContext(db, organizationId, async (tx) => {
      await tx.insert(organizations).values({ id: organizationId, name: "Org de prueba" });
      const [party] = await tx
        .insert(parties)
        .values({ organizationId, partyType: "person", displayName: "Propietario" })
        .returning({ id: parties.id });
      const [owner] = await tx.insert(owners).values({ organizationId, partyId: party!.id }).returning({ id: owners.id });

      await tx.insert(commissionConcepts).values({
        organizationId,
        code: "RENT-COMM",
        name: "Comisión sobre alquiler",
        paymentDestination: "administration",
        conceptType: "owner",
        percentage: "10",
        hasVat: true,
        hasCommissionTax: false,
        validFrom: "2020-01-01",
      });

      return { ownerId: owner!.id };
    });

    const resolved = await resolveCommissionConcept(db, {
      organizationId,
      code: "RENT-COMM",
      ownerId,
      date: "2026-08-01",
    });

    expect(resolved?.percentage).toBe("10.00000000");
    expect(resolved?.hasVat).toBe(true);
    expect(resolved?.overridden).toBe(false);
  });

  it("aplica el override vigente del propietario sin perder los campos no pisados (COMM-002)", async () => {
    const organizationId = randomUUID();
    const { ownerId } = await withOrganizationContext(db, organizationId, async (tx) => {
      await tx.insert(organizations).values({ id: organizationId, name: "Org de prueba" });
      const [party] = await tx
        .insert(parties)
        .values({ organizationId, partyType: "person", displayName: "Propietario VIP" })
        .returning({ id: parties.id });
      const [owner] = await tx.insert(owners).values({ organizationId, partyId: party!.id }).returning({ id: owners.id });

      const [concept] = await tx
        .insert(commissionConcepts)
        .values({
          organizationId,
          code: "RENT-COMM",
          name: "Comisión sobre alquiler",
          paymentDestination: "administration",
          conceptType: "owner",
          percentage: "10",
          maxAmount: "5000.000000",
          hasVat: true,
          hasCommissionTax: false,
          validFrom: "2020-01-01",
        })
        .returning({ id: commissionConcepts.id });

      // Negociación particular: 7% en vez del 10% general, sin tocar el
      // máximo ni el resto del concepto.
      await tx.insert(commissionConceptOverrides).values({
        organizationId,
        commissionConceptId: concept!.id,
        ownerId: owner!.id,
        percentage: "7",
        validFrom: "2026-01-01",
      });

      return { ownerId: owner!.id };
    });

    const resolved = await resolveCommissionConcept(db, {
      organizationId,
      code: "RENT-COMM",
      ownerId,
      date: "2026-08-01",
    });

    expect(resolved?.percentage).toBe("7.00000000");
    expect(resolved?.maxAmount).toBe("5000.000000"); // heredado del concepto base
    expect(resolved?.overridden).toBe(true);
  });

  it("ignora un override fuera de vigencia y devuelve null si el concepto tampoco está vigente", async () => {
    const organizationId = randomUUID();
    await withOrganizationContext(db, organizationId, async (tx) => {
      await tx.insert(organizations).values({ id: organizationId, name: "Org de prueba" });
      await tx.insert(commissionConcepts).values({
        organizationId,
        code: "RENT-COMM",
        name: "Comisión sobre alquiler",
        paymentDestination: "administration",
        conceptType: "owner",
        percentage: "10",
        validFrom: "2027-01-01", // todavía no vigente en 2026-08
      });
    });

    const resolved = await resolveCommissionConcept(db, {
      organizationId,
      code: "RENT-COMM",
      ownerId: randomUUID(),
      date: "2026-08-01",
    });

    expect(resolved).toBeNull();
  });
});
