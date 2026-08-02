import { and, eq } from "drizzle-orm";
import { parameters, withOrganizationContext, type Database } from "@farfalla/database";

export const VAT_RATE_CATEGORY = "vat_rate";
export const VAT_RATE_GENERAL_CODE = "general";

function isActiveAt<T extends { validFrom: string; validTo: string | null }>(row: T, date: string): boolean {
  return row.validFrom <= date && (row.validTo === null || row.validTo >= date);
}

/**
 * Tasa de IVA vigente (spec, sección 3.5: tasas fiscales parametrizables
 * — CLAUDE.md regla 6/13). Nunca se asume un porcentaje fijo en código:
 * si no hay una fila de `parameters` vigente para (vat_rate, general),
 * lanza en vez de aplicar un valor por defecto.
 */
export async function resolveVatRate(db: Database, organizationId: string, date: string): Promise<string> {
  return withOrganizationContext(db, organizationId, async (tx) => {
    const rows = await tx
      .select()
      .from(parameters)
      .where(and(eq(parameters.category, VAT_RATE_CATEGORY), eq(parameters.code, VAT_RATE_GENERAL_CODE)));
    const active = rows.find((row) => isActiveAt(row, date));
    if (!active) {
      throw new Error(
        "No hay una tasa de IVA vigente configurada (parameters: vat_rate/general) — cargarla antes de facturar IVA",
      );
    }
    const value = active.value as { percentage?: string };
    if (!value.percentage) {
      throw new Error("La tasa de IVA vigente no tiene 'percentage' en su value — dato de configuración inválido");
    }
    return value.percentage;
  });
}
