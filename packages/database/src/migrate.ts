import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "./client";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL no está definida");
  }
  const db = createDatabase(connectionString);
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migraciones aplicadas.");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
