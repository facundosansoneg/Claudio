"use server";

import { revalidatePath } from "next/cache";
import { generateCharge, registerPaymentAndIssueReceipt } from "@farfalla/domain";
import { getDb } from "@/lib/db";
import { getCurrentUserContext } from "@/lib/current-user";
import { hasPermission } from "@/lib/require-permission";

export async function generateChargeAction(formData: FormData) {
  const context = await getCurrentUserContext();
  if (!context) throw new Error("No autenticado");

  const allowed = await hasPermission(context, "charge", "create");
  if (!allowed) throw new Error("No autorizado");

  const leaseId = String(formData.get("leaseId") ?? "").trim();
  const period = String(formData.get("period") ?? "").trim();
  const amount = String(formData.get("amount") ?? "").trim();
  if (!leaseId || !period || !amount) throw new Error("Faltan campos obligatorios");

  await generateCharge(getDb(), {
    organizationId: context.organizationId,
    leaseId,
    chargeType: "rent",
    period,
    dueDate: `${period}-01`,
    amount,
    triggeredBy: context.userId,
  });

  revalidatePath("/charges");
}

export async function collectChargeAction(formData: FormData) {
  const context = await getCurrentUserContext();
  if (!context) throw new Error("No autenticado");

  const allowed = await hasPermission(context, "payment", "create");
  if (!allowed) throw new Error("No autorizado");

  const chargeId = String(formData.get("chargeId") ?? "").trim();
  const amount = String(formData.get("amount") ?? "").trim();
  if (!chargeId || !amount) throw new Error("Faltan campos obligatorios");

  await registerPaymentAndIssueReceipt(getDb(), {
    organizationId: context.organizationId,
    chargeId,
    paymentDate: new Date().toISOString().slice(0, 10),
    amount,
    triggeredBy: context.userId,
  });

  revalidatePath("/charges");
  revalidatePath("/receipts");
}
