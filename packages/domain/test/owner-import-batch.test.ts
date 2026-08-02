import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import {
  createDatabase,
  withOrganizationContext,
  organizations,
  users,
  owners,
  parties,
  importBatches,
  importRows,
  type Database,
} from "@farfalla/database";
import { createOwnerImportBatch } from "../src/migration/create-owner-import-batch";
import { commitOwnerImportBatch } from "../src/migration/commit-owner-import-batch";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://farfalla:farfalla@localhost:5432/farfalla_test";
const MIGRATIONS_FOLDER = "../database/drizzle";

let db: Database;

async function setupOrgWithUser() {
  const organizationId = randomUUID();
  const userId = await withOrganizationContext(db, organizationId, async (tx) => {
    await tx.insert(organizations).values({ id: organizationId, name: "Org de prueba" });
    const [user] = await tx
      .insert(users)
      .values({ organizationId, email: `${randomUUID()}@farfalla.uy`, displayName: "Operador" })
      .returning({ id: users.id });
    return user!.id;
  });
  return { organizationId, userId };
}

beforeAll(async () => {
  db = createDatabase(TEST_DATABASE_URL);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
});

afterAll(async () => {
  await db.execute(
    sql`TRUNCATE TABLE import_rows, import_batches, owners, parties, users, organizations RESTART IDENTITY CASCADE`,
  );
});

const SAMPLE_CSV = `display_name,party_type,document_number,legacy_sga_code
Juan Pérez,person,12345678,SGA-001
,person,,SGA-002
María García,person,87654321,SGA-003`;

describe("createOwnerImportBatch + commitOwnerImportBatch (spec 16.1/16.2)", () => {
  it("valida el CSV, deja las filas en staging y solo importa las válidas al confirmar", async () => {
    const { organizationId, userId } = await setupOrgWithUser();

    const created = await createOwnerImportBatch(db, {
      organizationId,
      csvText: SAMPLE_CSV,
      sourceFilename: "propietarios.csv",
      createdBy: userId,
    });

    expect(created.totalRows).toBe(3);
    expect(created.validRowCount).toBe(2);
    expect(created.invalidRowCount).toBe(1);

    // Antes de confirmar, no se creó ningún owner todavía.
    const ownersBeforeCommit = await withOrganizationContext(db, organizationId, (tx) => tx.select().from(owners));
    expect(ownersBeforeCommit).toHaveLength(0);

    const committed = await commitOwnerImportBatch(db, { organizationId, batchId: created.batchId, triggeredBy: userId });

    expect(committed.importedRowCount).toBe(2);
    expect(committed.skippedInvalidRowCount).toBe(1);

    const ownersList = await withOrganizationContext(db, organizationId, (tx) =>
      tx.select({ legacySgaCode: owners.legacySgaCode, displayName: parties.displayName }).from(owners).innerJoin(parties, eq(parties.id, owners.partyId)),
    );
    expect(ownersList.map((o) => o.legacySgaCode).sort()).toEqual(["SGA-001", "SGA-003"]);

    const [batch] = await withOrganizationContext(db, organizationId, (tx) =>
      tx.select().from(importBatches).where(eq(importBatches.id, created.batchId)),
    );
    expect(batch?.status).toBe("committed");
    expect(batch?.importedRowCount).toBe(2);

    const rows = await withOrganizationContext(db, organizationId, (tx) =>
      tx.select().from(importRows).where(eq(importRows.batchId, created.batchId)),
    );
    const invalidRow = rows.find((r) => r.status === "invalid");
    expect(invalidRow?.errors).toEqual(["display_name es obligatorio"]);
    expect(rows.filter((r) => r.status === "imported")).toHaveLength(2);
  });

  it("rechaza confirmar el mismo lote dos veces", async () => {
    const { organizationId, userId } = await setupOrgWithUser();
    const created = await createOwnerImportBatch(db, {
      organizationId,
      csvText: "display_name\nJuan Pérez",
      createdBy: userId,
    });

    await commitOwnerImportBatch(db, { organizationId, batchId: created.batchId, triggeredBy: userId });

    await expect(
      commitOwnerImportBatch(db, { organizationId, batchId: created.batchId, triggeredBy: userId }),
    ).rejects.toThrow(/ya fue confirmado/);
  });

  it("rechaza un CSV sin filas de datos", async () => {
    const { organizationId, userId } = await setupOrgWithUser();

    await expect(
      createOwnerImportBatch(db, { organizationId, csvText: "display_name\n", createdBy: userId }),
    ).rejects.toThrow(/no tiene filas/);
  });
});
