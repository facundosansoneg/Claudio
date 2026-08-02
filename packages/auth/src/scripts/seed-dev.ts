import { createDatabase } from "@farfalla/database";
import { seedDemoDataset } from "@farfalla/domain";
import { seedDevUser, DEV_LOGIN_SUBJECT } from "../dev-login";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL no está definida");

  const db = createDatabase(connectionString);
  const result = await seedDevUser(db);
  const dataset = await seedDemoDataset(db, result.organizationId, result.userId);

  console.log("Usuario de prueba listo:");
  console.log(`  organización: ${result.organizationId}`);
  console.log(`  usuario:      ${result.userId} (demo@farfalla.uy)`);
  console.log(`  subject:      ${DEV_LOGIN_SUBJECT}`);
  console.log("");
  console.log("Con AUTH_ENABLE_DEV_LOGIN=true, iniciá sesión desde la web con el botón");
  console.log('"Login de prueba (sin Azure)" — no pide contraseña.');
  console.log("");
  console.log("Dataset de demo cargado:");
  console.log(`  ${dataset.ownerIds.length} propietarios, ${dataset.propertyIds.length} propiedades, ${dataset.leaseIds.length} contratos`);
  console.log("  con cargos de los últimos 2 meses cobrados y el mes en curso pendiente.");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
