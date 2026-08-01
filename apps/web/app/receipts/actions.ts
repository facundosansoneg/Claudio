"use server";

import { revalidatePath } from "next/cache";
import { reprintReceipt, reverseReceipt } from "@farfalla/domain";
import { getDb } from "@/lib/db";
import { getCurrentUserContext } from "@/lib/current-user";
import { hasPermission } from "@/lib/require-permission";

export async function reprintReceiptAction(formData: FormData) {
  const context = await getCurrentUserContext();
  if (!context) throw new Error("No autenticado");

  const allowed = await hasPermission(context, "receipt", "reprint");
  if (!allowed) throw new Error("No autorizado");

  const receiptId = String(formData.get("receiptId") ?? "").trim();
  if (!receiptId) throw new Error("Falta el recibo");

  await reprintReceipt(getDb(), {
    organizationId: context.organizationId,
    receiptId,
    triggeredBy: context.userId,
  });

  revalidatePath("/receipts");
}

export async function reverseReceiptAction(formData: FormData) {
  const context = await getCurrentUserContext();
  if (!context) throw new Error("No autenticado");

  const allowed = await hasPermission(context, "receipt", "reverse");
  if (!allowed) throw new Error("No autorizado");

  const receiptId = String(formData.get("receiptId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!receiptId || !reason) throw new Error("Falta el recibo o el motivo de anulación");

  await reverseReceipt(getDb(), {
    organizationId: context.organizationId,
    receiptId,
    reason,
    triggeredBy: context.userId,
  });

  revalidatePath("/receipts");
  revalidatePath("/charges");
}
