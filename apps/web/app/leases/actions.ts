"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  withOrganizationContext,
  recordAuditEvent,
  leases,
  leaseParties,
  tenants,
  type Database,
} from "@farfalla/database";
import { getDb } from "@/lib/db";
import { getCurrentUserContext } from "@/lib/current-user";
import { hasPermission } from "@/lib/require-permission";

export async function createLeaseAction(formData: FormData) {
  const context = await getCurrentUserContext();
  if (!context) throw new Error("No autenticado");

  const allowed = await hasPermission(context, "lease", "create");
  if (!allowed) throw new Error("No autorizado");

  const unitId = String(formData.get("unitId") ?? "").trim();
  const tenantId = String(formData.get("tenantId") ?? "").trim();
  const leaseNumber = String(formData.get("leaseNumber") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "").trim();
  const endDate = String(formData.get("endDate") ?? "").trim();
  const currency = String(formData.get("currency") ?? "UYU");
  const initialRent = String(formData.get("initialRent") ?? "").trim();

  if (!unitId || !tenantId || !leaseNumber || !startDate || !endDate || !initialRent) {
    throw new Error("Faltan campos obligatorios");
  }

  await withOrganizationContext(getDb(), context.organizationId, async (tx: Database) => {
    const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, tenantId));
    if (!tenant) throw new Error("Inquilino no encontrado");

    const [lease] = await tx
      .insert(leases)
      .values({
        organizationId: context.organizationId,
        unitId,
        leaseNumber,
        startDate,
        endDate,
        currency,
        initialRent,
      })
      .returning({ id: leases.id });
    if (!lease) throw new Error("No se pudo crear el contrato");

    await tx.insert(leaseParties).values({
      organizationId: context.organizationId,
      leaseId: lease.id,
      partyId: tenant.partyId,
      tenantId: tenant.id,
      role: "tenant",
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      userId: context.userId,
      entityType: "leases",
      entityId: lease.id,
      action: "create",
      newState: { unitId, tenantId, leaseNumber, currency, initialRent },
    });
  });

  revalidatePath("/leases");
}
