import { createDatabase, type Database } from "@farfalla/database";

let db: Database | null = null;

/** Pool compartido por el proceso — no crear uno nuevo por request. */
export function getDb(): Database {
  if (!db) db = createDatabase(process.env.DATABASE_URL ?? "");
  return db;
}
