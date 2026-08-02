import Link from "next/link";
import { desc } from "drizzle-orm";
import { withOrganizationContext, marketComparables } from "@farfalla/database";
import { getDb } from "@/lib/db";
import { getCurrentUserContext } from "@/lib/current-user";
import { hasPermission } from "@/lib/require-permission";
import { createMarketComparableAction } from "./actions";

export default async function MarketComparablesPage() {
  const context = await getCurrentUserContext();
  if (!context) {
    return (
      <main>
        <p>
          No hay sesión activa. <Link href="/">Volver</Link>
        </p>
      </main>
    );
  }

  const [canView, canCreate] = await Promise.all([
    hasPermission(context, "market_comparable", "view"),
    hasPermission(context, "market_comparable", "create"),
  ]);

  if (!canView) {
    return (
      <main>
        <p>No tenés permiso para ver comparables de mercado.</p>
      </main>
    );
  }

  const comparablesList = await withOrganizationContext(getDb(), context.organizationId, (tx) =>
    tx.select().from(marketComparables).orderBy(desc(marketComparables.captureDate)),
  );

  return (
    <main>
      <p>
        <Link href="/">← Dashboard</Link>
      </p>
      <h1>Comparables de mercado</h1>
      <p>
        <small>
          Catálogo de venta y alquiler cargado a mano (spec, sección 10.2) — materia prima de las
          estimaciones automáticas que se generan desde la ficha de cada propiedad. No hay
          integración con portales inmobiliarios: la carga es manual o vía CSV (pendiente).
        </small>
      </p>

      {comparablesList.length === 0 ? (
        <p>Todavía no hay comparables cargados.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Dirección</th>
              <th>Zona</th>
              <th>Precio</th>
              <th>m²</th>
              <th>Precio/m²</th>
              <th>Comparabilidad</th>
              <th>Fuente</th>
            </tr>
          </thead>
          <tbody>
            {comparablesList.map((comparable) => (
              <tr key={comparable.id}>
                <td>{comparable.captureDate}</td>
                <td>{comparable.transactionType === "sale" ? "Venta" : "Alquiler"}</td>
                <td>{comparable.address ?? "—"}</td>
                <td>{comparable.zone ?? comparable.neighborhood ?? "—"}</td>
                <td>
                  {comparable.price} {comparable.currency}
                </td>
                <td>{comparable.areaM2 ?? "—"}</td>
                <td>{comparable.pricePerSqm ?? "sin calcular (falta m²)"}</td>
                <td>{comparable.comparabilityLevel ?? "—"}</td>
                <td>{comparable.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {canCreate && (
        <>
          <h2>Nuevo comparable</h2>
          <form action={createMarketComparableAction}>
            <div>
              <label>
                Tipo{" "}
                <select name="transactionType" defaultValue="sale">
                  <option value="sale">Venta</option>
                  <option value="rent">Alquiler</option>
                </select>
              </label>
            </div>
            <div>
              <label>
                Dirección <input name="address" />
              </label>
            </div>
            <div>
              <label>
                Barrio <input name="neighborhood" />
              </label>
            </div>
            <div>
              <label>
                Zona <input name="zone" />
              </label>
            </div>
            <div>
              <label>
                Latitud <input name="latitude" type="number" step="0.0000000001" />
              </label>
            </div>
            <div>
              <label>
                Longitud <input name="longitude" type="number" step="0.0000000001" />
              </label>
            </div>
            <div>
              <label>
                Fecha de captura <input type="date" name="captureDate" required />
              </label>
            </div>
            <div>
              <label>
                Precio <input name="price" type="number" step="0.000001" required />
              </label>
            </div>
            <div>
              <label>
                Moneda{" "}
                <select name="currency" defaultValue="USD">
                  <option value="USD">USD</option>
                  <option value="UYU">UYU</option>
                </select>
              </label>
            </div>
            <div>
              <label>
                Superficie m² <input name="areaM2" type="number" step="0.000001" />
              </label>
            </div>
            <div>
              <label>
                Dormitorios <input name="bedrooms" type="number" min="0" />
              </label>
            </div>
            <div>
              <label>
                Baños <input name="bathrooms" type="number" min="0" />
              </label>
            </div>
            <div>
              <label>
                Garajes <input name="parkingSpaces" type="number" min="0" />
              </label>
            </div>
            <div>
              <label>
                Terraza{" "}
                <select name="hasTerrace" defaultValue="unknown">
                  <option value="unknown">Sin dato</option>
                  <option value="yes">Sí</option>
                  <option value="no">No</option>
                </select>
              </label>
            </div>
            <div>
              <label>
                Estado <input name="condition" placeholder="A estrenar, muy bueno, a refaccionar..." />
              </label>
            </div>
            <div>
              <label>
                Año de construcción <input name="constructionYear" type="number" />
              </label>
            </div>
            <div>
              <label>
                Amenities <input name="amenities" placeholder="Piscina, gimnasio, portería..." />
              </label>
            </div>
            <div>
              <label>
                Fuente <input name="source" required placeholder="Portal, corredor, publicación..." />
              </label>
            </div>
            <div>
              <label>
                URL <input name="url" type="url" />
              </label>
            </div>
            <div>
              <label>
                Nivel de comparabilidad{" "}
                <select name="comparabilityLevel" defaultValue="">
                  <option value="">Sin evaluar</option>
                  <option value="high">Alta</option>
                  <option value="medium">Media</option>
                  <option value="low">Baja</option>
                </select>
              </label>
            </div>
            <button type="submit">Cargar comparable</button>
          </form>
        </>
      )}
    </main>
  );
}
