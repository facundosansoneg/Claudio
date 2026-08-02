import { and, eq, sql } from "drizzle-orm";
import {
  parties,
  owners,
  properties,
  units,
  ownershipInterests,
  tenants,
  leases,
  leaseParties,
  charges,
  taxProfiles,
  journalEntries,
  withOrganizationContext,
  type Database,
} from "@farfalla/database";
import { seedChartOfAccounts } from "../accounting/chart-of-accounts";
import { generateCharge } from "../accounting/generate-charge";
import { registerPaymentAndIssueReceipt } from "../accounting/register-payment";
import { distributeChargeToOwners } from "../accounting/distribute-charge-to-owners";

// IDs fijos y deterministas para que el seed sea idempotente: correrlo
// de nuevo no duplica filas (a diferencia de charges/payments, que usan
// su propia idempotencia — ver más abajo).
const OWNER_A_PARTY_ID = "00000000-0000-0000-0000-000000000101";
const OWNER_A_ID = "00000000-0000-0000-0000-000000000102";
const OWNER_B_PARTY_ID = "00000000-0000-0000-0000-000000000103";
const OWNER_B_ID = "00000000-0000-0000-0000-000000000104";

const PROPERTY_1_ID = "00000000-0000-0000-0000-000000000201";
const UNIT_1_ID = "00000000-0000-0000-0000-000000000202";
const PROPERTY_2_ID = "00000000-0000-0000-0000-000000000203";
const UNIT_2_ID = "00000000-0000-0000-0000-000000000204";

const OWNERSHIP_INTEREST_1A_ID = "00000000-0000-0000-0000-000000000211";
const OWNERSHIP_INTEREST_1B_ID = "00000000-0000-0000-0000-000000000212";
const OWNERSHIP_INTEREST_2A_ID = "00000000-0000-0000-0000-000000000213";

const TENANT_1_PARTY_ID = "00000000-0000-0000-0000-000000000301";
const TENANT_1_ID = "00000000-0000-0000-0000-000000000302";
const TENANT_2_PARTY_ID = "00000000-0000-0000-0000-000000000303";
const TENANT_2_ID = "00000000-0000-0000-0000-000000000304";

const LEASE_1_ID = "00000000-0000-0000-0000-000000000401";
const LEASE_2_ID = "00000000-0000-0000-0000-000000000402";

const TAX_PROFILE_A_ID = "00000000-0000-0000-0000-000000000501";

function monthPeriod(monthsAgo: number): { period: string; dueDate: string } {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));
  const period = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  return { period, dueDate: `${period}-01` };
}

export interface SeedDemoDatasetResult {
  ownerIds: string[];
  propertyIds: string[];
  leaseIds: string[];
}

/**
 * Dataset de demo visualizable (spec, sección 22 — versión inicial,
 * incremental hito a hito). Reproduce el escenario E2E-002 del spec:
 * dos propietarios 60/40 con aporte fiscal 100/0 en una propiedad
 * compartida, más una segunda propiedad de un solo propietario. Genera
 * cargos de los últimos 2 meses ya cobrados (con recibo) y el mes en
 * curso pendiente, para que las pantallas no arranquen vacías.
 *
 * Pensado para `pnpm run db:seed:dev`; no correr contra producción.
 */
export async function seedDemoDataset(
  db: Database,
  organizationId: string,
  triggeredBy: string,
): Promise<SeedDemoDatasetResult> {
  return withOrganizationContext(db, organizationId, async (tx) => {
    await seedChartOfAccounts(tx, organizationId);

    await tx
      .insert(parties)
      .values([
        {
          id: OWNER_A_PARTY_ID,
          organizationId,
          partyType: "person",
          displayName: "María Fernández",
          documentType: "CI",
          documentNumber: "1.111.111-1",
        },
        {
          id: OWNER_B_PARTY_ID,
          organizationId,
          partyType: "company",
          displayName: "Farfalla Inversiones SRL",
          documentType: "RUT",
          documentNumber: "21.222.222-2",
          isLegalPerson: true,
        },
      ])
      .onConflictDoNothing();

    await tx
      .insert(owners)
      .values([
        { id: OWNER_A_ID, organizationId, partyId: OWNER_A_PARTY_ID },
        { id: OWNER_B_ID, organizationId, partyId: OWNER_B_PARTY_ID },
      ])
      .onConflictDoNothing();

    await tx
      .insert(properties)
      .values([
        {
          id: PROPERTY_1_ID,
          organizationId,
          internalCode: "DEMO-P1",
          name: "Edificio Pocitos",
          propertyType: "apartamento",
          street: "Av. Brasil",
          doorNumber: "2450",
          neighborhood: "Pocitos",
          city: "Montevideo",
          department: "Montevideo",
          referenceCurrency: "UYU",
        },
        {
          id: PROPERTY_2_ID,
          organizationId,
          internalCode: "DEMO-P2",
          name: "Casa Carrasco",
          propertyType: "casa",
          street: "Arocena",
          doorNumber: "1780",
          neighborhood: "Carrasco",
          city: "Montevideo",
          department: "Montevideo",
          referenceCurrency: "USD",
        },
      ])
      .onConflictDoNothing();

    await tx
      .insert(units)
      .values([
        {
          id: UNIT_1_ID,
          organizationId,
          propertyId: PROPERTY_1_ID,
          unitCode: "101",
          unitType: "apartamento",
          bedrooms: 2,
          bathrooms: 1,
          occupancyStatus: "occupied",
          targetRent: "30000.000000",
          targetRentCurrency: "UYU",
        },
        {
          id: UNIT_2_ID,
          organizationId,
          propertyId: PROPERTY_2_ID,
          unitCode: "principal",
          unitType: "casa",
          bedrooms: 3,
          bathrooms: 2,
          occupancyStatus: "occupied",
          targetRent: "500.000000",
          targetRentCurrency: "USD",
        },
      ])
      .onConflictDoNothing();

    // Escenario E2E-002 del spec: 60/40 legal/económico/renta, 100/0
    // fiscal — el mismo caso probado en validate-ownership-interests.
    //
    // Upsert (no onConflictDoNothing): en una base persistente como
    // Neon, una fila insertada por una versión vieja de este seed
    // (antes de fijar validFrom acá) puede haber quedado con el
    // default `now()` de ese momento — un valid_from posterior a
    // cargos de meses anteriores generados en corridas futuras del
    // seed, rompiendo la distribución automática más abajo. El upsert
    // fuerza siempre el valor que este código pretende, así una fila
    // vieja se autocorrige en la próxima corrida en vez de quedar
    // congelada para siempre.
    const ownershipInterestUpsertSet = {
      organizationId: sql`excluded.organization_id`,
      propertyId: sql`excluded.property_id`,
      ownerId: sql`excluded.owner_id`,
      legalPercentage: sql`excluded.legal_percentage`,
      economicPercentage: sql`excluded.economic_percentage`,
      rentDistributionPercentage: sql`excluded.rent_distribution_percentage`,
      taxContributionPercentage: sql`excluded.tax_contribution_percentage`,
      validFrom: sql`excluded.valid_from`,
    };
    await tx
      .insert(ownershipInterests)
      .values([
        {
          id: OWNERSHIP_INTEREST_1A_ID,
          organizationId,
          propertyId: PROPERTY_1_ID,
          ownerId: OWNER_A_ID,
          legalPercentage: "60",
          economicPercentage: "60",
          rentDistributionPercentage: "60",
          taxContributionPercentage: "100",
          validFrom: "2026-01-01",
        },
        {
          id: OWNERSHIP_INTEREST_1B_ID,
          organizationId,
          propertyId: PROPERTY_1_ID,
          ownerId: OWNER_B_ID,
          legalPercentage: "40",
          economicPercentage: "40",
          rentDistributionPercentage: "40",
          taxContributionPercentage: "0",
          validFrom: "2026-01-01",
        },
        {
          id: OWNERSHIP_INTEREST_2A_ID,
          organizationId,
          propertyId: PROPERTY_2_ID,
          ownerId: OWNER_A_ID,
          legalPercentage: "100",
          economicPercentage: "100",
          rentDistributionPercentage: "100",
          taxContributionPercentage: "100",
          validFrom: "2026-01-01",
        },
      ])
      .onConflictDoUpdate({ target: ownershipInterests.id, set: ownershipInterestUpsertSet });

    await tx
      .insert(parties)
      .values([
        { id: TENANT_1_PARTY_ID, organizationId, partyType: "person", displayName: "Juan Rodríguez", documentType: "CI", documentNumber: "2.222.222-2" },
        { id: TENANT_2_PARTY_ID, organizationId, partyType: "person", displayName: "Ana Silva", documentType: "CI", documentNumber: "3.333.333-3" },
      ])
      .onConflictDoNothing();

    await tx
      .insert(tenants)
      .values([
        { id: TENANT_1_ID, organizationId, partyId: TENANT_1_PARTY_ID },
        { id: TENANT_2_ID, organizationId, partyId: TENANT_2_PARTY_ID },
      ])
      .onConflictDoNothing();

    await tx
      .insert(leases)
      .values([
        {
          id: LEASE_1_ID,
          organizationId,
          unitId: UNIT_1_ID,
          leaseNumber: "DEMO-L1",
          startDate: "2026-01-01",
          endDate: "2027-12-31",
          currency: "UYU",
          initialRent: "30000.000000",
          dueDay: 1,
          commissionOnRentPercentage: "10",
        },
        {
          id: LEASE_2_ID,
          organizationId,
          unitId: UNIT_2_ID,
          leaseNumber: "DEMO-L2",
          startDate: "2026-01-01",
          endDate: "2027-12-31",
          currency: "USD",
          initialRent: "500.000000",
          dueDay: 1,
          commissionOnRentPercentage: "10",
        },
      ])
      .onConflictDoNothing();

    // Solo María (owner A) tiene perfil fiscal — Farfalla Inversiones no
    // retiene nada hasta que se le asigne uno (CLAUDE.md: nunca asumir
    // una tasa fiscal).
    await tx
      .insert(taxProfiles)
      .values({
        id: TAX_PROFILE_A_ID,
        organizationId,
        ownerId: OWNER_A_ID,
        taxType: "irpf",
        percentage: "10.5",
        validFrom: "2020-01-01",
      })
      .onConflictDoNothing();

    await tx
      .insert(leaseParties)
      .values([
        { organizationId, leaseId: LEASE_1_ID, partyId: TENANT_1_PARTY_ID, tenantId: TENANT_1_ID, role: "tenant" },
        { organizationId, leaseId: LEASE_2_ID, partyId: TENANT_2_PARTY_ID, tenantId: TENANT_2_ID, role: "tenant" },
      ])
      .onConflictDoNothing();

    const leaseAmounts: Record<string, string> = {
      [LEASE_1_ID]: "30000.000000",
      [LEASE_2_ID]: "500.000000",
    };

    for (const leaseId of [LEASE_1_ID, LEASE_2_ID]) {
      for (let monthsAgo = 2; monthsAgo >= 0; monthsAgo--) {
        const { period, dueDate } = monthPeriod(monthsAgo);
        const { chargeId } = await generateCharge(tx, {
          organizationId,
          leaseId,
          chargeType: "rent",
          period,
          dueDate,
          amount: leaseAmounts[leaseId]!,
          triggeredBy,
        });

        if (monthsAgo > 0) {
          // Los meses anteriores al actual quedan cobrados, con recibo.
          const [charge] = await tx.select().from(charges).where(eq(charges.id, chargeId));
          if (charge && charge.status === "pending") {
            await registerPaymentAndIssueReceipt(tx, {
              organizationId,
              chargeId,
              paymentDate: dueDate,
              amount: charge.balance,
              triggeredBy,
            });
          }

          // El mes más antiguo queda además liquidado a los propietarios,
          // para que el estado de cuenta no arranque vacío. El más
          // reciente de los dos cobrados queda sin liquidar a propósito,
          // para poder probar el botón "Liquidar" manualmente.
          if (monthsAgo === 2) {
            const [existingDistribution] = await tx
              .select({ id: journalEntries.id })
              .from(journalEntries)
              .where(and(eq(journalEntries.source, "owner_accrual"), eq(journalEntries.sourceDocumentId, chargeId)));
            if (!existingDistribution) {
              await distributeChargeToOwners(tx, { organizationId, chargeId, triggeredBy });
            }
          }
        }
        // monthsAgo === 0 (mes en curso) queda pendiente a propósito,
        // para tener algo que cobrar al probar la pantalla de cargos.
      }
    }

    return {
      ownerIds: [OWNER_A_ID, OWNER_B_ID],
      propertyIds: [PROPERTY_1_ID, PROPERTY_2_ID],
      leaseIds: [LEASE_1_ID, LEASE_2_ID],
    };
  });
}
