"use server";

import { revalidatePath } from "next/cache";
import { createVendor } from "@farfalla/domain";
import { getDb } from "@/lib/db";
import { getCurrentUserContext } from "@/lib/current-user";
import { hasPermission } from "@/lib/require-permission";

export async function createVendorAction(formData: FormData) {
  const context = await getCurrentUserContext();
  if (!context) throw new Error("No autenticado");

  const allowed = await hasPermission(context, "vendor", "create");
  if (!allowed) throw new Error("No autorizado");

  const legalName = String(formData.get("legalName") ?? "").trim();
  const taxId = String(formData.get("taxId") ?? "").trim() || null;
  const category = String(formData.get("category") ?? "").trim() || null;
  const contactName = String(formData.get("contactName") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const bankAccountInfo = String(formData.get("bankAccountInfo") ?? "").trim() || null;
  const ratingInput = String(formData.get("rating") ?? "").trim();
  const insuranceReference = String(formData.get("insuranceReference") ?? "").trim() || null;
  const insuranceExpiryDate = String(formData.get("insuranceExpiryDate") ?? "").trim() || null;

  await createVendor(getDb(), {
    organizationId: context.organizationId,
    legalName,
    taxId,
    category,
    contactName,
    email,
    phone,
    bankAccountInfo,
    rating: ratingInput ? Number(ratingInput) : null,
    insuranceReference,
    insuranceExpiryDate,
    createdBy: context.userId,
  });

  revalidatePath("/vendors");
}
