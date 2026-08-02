"use server";

import { revalidatePath } from "next/cache";
import { withOrganizationContext, recordAuditEvent, marketComparables } from "@farfalla/database";
import { divideMoney } from "@farfalla/domain";
import { getDb } from "@/lib/db";
import { getCurrentUserContext } from "@/lib/current-user";
import { hasPermission } from "@/lib/require-permission";

export async function createMarketComparableAction(formData: FormData) {
  const context = await getCurrentUserContext();
  if (!context) throw new Error("No autenticado");

  const allowed = await hasPermission(context, "market_comparable", "create");
  if (!allowed) throw new Error("No autorizado");

  const transactionType = String(formData.get("transactionType") ?? "sale");
  const address = String(formData.get("address") ?? "").trim() || null;
  const neighborhood = String(formData.get("neighborhood") ?? "").trim() || null;
  const zone = String(formData.get("zone") ?? "").trim() || null;
  const latitude = String(formData.get("latitude") ?? "").trim() || null;
  const longitude = String(formData.get("longitude") ?? "").trim() || null;
  const captureDate = String(formData.get("captureDate") ?? "").trim();
  const price = String(formData.get("price") ?? "").trim();
  const currency = String(formData.get("currency") ?? "USD");
  const areaM2 = String(formData.get("areaM2") ?? "").trim() || null;
  const bedroomsInput = String(formData.get("bedrooms") ?? "").trim();
  const bathroomsInput = String(formData.get("bathrooms") ?? "").trim();
  const parkingSpacesInput = String(formData.get("parkingSpaces") ?? "").trim();
  const hasTerrace = String(formData.get("hasTerrace") ?? "unknown");
  const condition = String(formData.get("condition") ?? "").trim() || null;
  const constructionYearInput = String(formData.get("constructionYear") ?? "").trim();
  const amenities = String(formData.get("amenities") ?? "").trim() || null;
  const source = String(formData.get("source") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim() || null;
  const comparabilityLevel = String(formData.get("comparabilityLevel") ?? "").trim() || null;

  if (!captureDate || !price || !source) throw new Error("Faltan campos obligatorios");

  // Precio por m² se calcula y persiste al cargar el comparable (spec,
  // sección 10.2) — si no hay superficie, queda null y el comparable no
  // se puede usar en una estimación hasta completarla.
  const pricePerSqm = areaM2 ? divideMoney(price, areaM2) : null;

  await withOrganizationContext(getDb(), context.organizationId, async (tx) => {
    const [comparable] = await tx
      .insert(marketComparables)
      .values({
        organizationId: context.organizationId,
        transactionType,
        address,
        neighborhood,
        zone,
        latitude,
        longitude,
        captureDate,
        price,
        currency,
        areaM2,
        pricePerSqm,
        bedrooms: bedroomsInput ? Number(bedroomsInput) : null,
        bathrooms: bathroomsInput ? Number(bathroomsInput) : null,
        parkingSpaces: parkingSpacesInput ? Number(parkingSpacesInput) : null,
        hasTerrace,
        condition,
        constructionYear: constructionYearInput ? Number(constructionYearInput) : null,
        amenities,
        source,
        url,
        comparabilityLevel,
        createdBy: context.userId,
      })
      .returning({ id: marketComparables.id });
    if (!comparable) throw new Error("No se pudo cargar el comparable");

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      userId: context.userId,
      entityType: "market_comparables",
      entityId: comparable.id,
      action: "create",
      newState: { transactionType, price, currency, areaM2, pricePerSqm, source },
    });
  });

  revalidatePath("/market-comparables");
}
