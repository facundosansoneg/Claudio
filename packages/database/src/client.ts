import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

export function createDatabase(connectionString: string): Database {
  const pool = new Pool({ connectionString });
  return drizzle(pool, { schema });
}

/**
 * Ejecuta `fn` dentro de una transacción con el contexto de organización
 * seteado para que las policies de Row-Level Security (ADR 0006) puedan
 * filtrar por `organization_id`. Toda request HTTP y todo job en segundo
 * plano debe pasar por acá antes de tocar tablas de dominio — nunca usar
 * el pool sin este wrapper para queries multi-tenant.
 */
export async function withOrganizationContext<T>(
  db: Database,
  organizationId: string,
  fn: (tx: Database) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_organization_id', ${organizationId}, true)`);
    return fn(tx as unknown as Database);
  });
}
