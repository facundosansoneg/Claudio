"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createOwnerImportBatch, commitOwnerImportBatch } from "@farfalla/domain";
import { getDb } from "@/lib/db";
import { getCurrentUserContext } from "@/lib/current-user";
import { hasPermission } from "@/lib/require-permission";

export async function uploadOwnerImportBatchAction(formData: FormData) {
  const context = await getCurrentUserContext();
  if (!context) throw new Error("No autenticado");

  const allowed = await hasPermission(context, "import_batch", "create");
  if (!allowed) throw new Error("No autorizado");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/migration/owners?error=${encodeURIComponent("Elegí un archivo CSV")}`);
  }

  const csvText = await (file as File).text();

  try {
    await createOwnerImportBatch(getDb(), {
      organizationId: context.organizationId,
      csvText,
      sourceFilename: (file as File).name,
      createdBy: context.userId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo procesar el CSV";
    redirect(`/migration/owners?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/migration/owners");
}

export async function commitOwnerImportBatchAction(formData: FormData) {
  const context = await getCurrentUserContext();
  if (!context) throw new Error("No autenticado");

  const allowed = await hasPermission(context, "import_batch", "commit");
  if (!allowed) throw new Error("No autorizado");

  const batchId = String(formData.get("batchId") ?? "").trim();
  if (!batchId) throw new Error("Falta el lote a confirmar");

  try {
    await commitOwnerImportBatch(getDb(), { organizationId: context.organizationId, batchId, triggeredBy: context.userId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo confirmar el lote";
    redirect(`/migration/owners?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/migration/owners");
}
