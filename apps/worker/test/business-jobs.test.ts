import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import {
  createDatabase,
  withOrganizationContext,
  organizations,
  properties,
  units,
  leases,
  jobRuns,
  type Database,
} from "@farfalla/database";
import { seedChartOfAccounts } from "@farfalla/domain";
import { runGenerateMonthlyCharges } from "../src/jobs/generate-monthly-charges";
import { runExpiringControls } from "../src/jobs/expiring-controls";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://farfalla:farfalla@localhost:5432/farfalla_test";

let db: Database;

async function setupOrgWithLease() {
  const organizationId = randomUUID();
  await withOrganizationContext(db, organizationId, async (tx) => {
    await tx.insert(organizations).values({ id: organizationId, name: "Org de prueba", status: "active" });
    await seedChartOfAccounts(tx, organizationId);
    const [property] = await tx
      .insert(properties)
      .values({ organizationId, internalCode: "P-1", name: "Propiedad", propertyType: "apartamento" })
      .returning({ id: properties.id });
    const [unit] = await tx
      .insert(units)
      .values({ organizationId, propertyId: property!.id, unitCode: "1", unitType: "apartamento" })
      .returning({ id: units.id });
    await tx.insert(leases).values({
      organizationId,
      unitId: unit!.id,
      leaseNumber: "L-1",
      startDate: "2026-01-01",
      endDate: "2027-12-31",
      currency: "USD",
      initialRent: "1000.000000",
      status: "active",
    });
  });
  return organizationId;
}

beforeAll(async () => {
  db = createDatabase(TEST_DATABASE_URL);
});

afterAll(async () => {
  await db.execute(
    sql`TRUNCATE TABLE job_runs, journal_lines, journal_entries, charges, leases, units, properties, ledger_accounts, organizations RESTART IDENTITY CASCADE`,
  );
});

describe("runGenerateMonthlyCharges (spec sección 15)", () => {
  it("genera los cargos de una organización y lo deja trazado en job_runs", async () => {
    const organizationId = await setupOrgWithLease();

    const result = await runGenerateMonthlyCharges(db, "test-schedule", organizationId, "2026-08");

    expect(result.created).toBe(1);

    const [run] = await db
      .select()
      .from(jobRuns)
      .where(eq(jobRuns.jobName, "billing.generate-monthly-charges"))
      .orderBy(sql`started_at desc`)
      .limit(1);
    expect(run?.status).toBe("succeeded");
    expect(run?.triggeredBy).toBe("test-schedule");
    expect(run?.organizationId).toBe(organizationId);
  });
});

describe("runExpiringControls (spec CTRL-001/CTRL-002)", () => {
  it("corre el centro de alertas de una organización y lo deja trazado en job_runs", async () => {
    const organizationId = await setupOrgWithLease();

    const result = await runExpiringControls(db, "test-schedule", organizationId, 30);

    expect(result).toBeDefined();
    expect(result.expiringLeases).toBeGreaterThanOrEqual(0);

    const [run] = await db
      .select()
      .from(jobRuns)
      .where(eq(jobRuns.jobName, "alerts.expiring-controls"))
      .orderBy(sql`started_at desc`)
      .limit(1);
    expect(run?.status).toBe("succeeded");
    expect(run?.organizationId).toBe(organizationId);
  });
});
