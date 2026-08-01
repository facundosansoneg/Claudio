import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import {
  withOrganizationContext,
  receipts,
  payments,
  paymentAllocations,
  charges,
  leases,
  units,
  properties,
  parties,
} from "@farfalla/database";
import { getDb } from "@/lib/db";
import { getCurrentUserContext } from "@/lib/current-user";
import { hasPermission } from "@/lib/require-permission";
import { reprintReceiptAction, reverseReceiptAction } from "./actions";

export default async function ReceiptsPage() {
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

  const [canView, canReprint, canReverse] = await Promise.all([
    hasPermission(context, "charge", "view"),
    hasPermission(context, "receipt", "reprint"),
    hasPermission(context, "receipt", "reverse"),
  ]);

  if (!canView) {
    return (
      <main>
        <p>No tenés permiso para ver recibos.</p>
      </main>
    );
  }

  const receiptsList = await withOrganizationContext(getDb(), context.organizationId, (tx) =>
    tx
      .select({
        id: receipts.id,
        receiptNumber: receipts.receiptNumber,
        issuedAt: receipts.issuedAt,
        status: receipts.status,
        reprintCount: receipts.reprintCount,
        voidReason: receipts.voidReason,
        amount: payments.amount,
        currency: payments.currency,
        leaseNumber: leases.leaseNumber,
        propertyName: properties.name,
        tenantName: parties.displayName,
      })
      .from(receipts)
      .innerJoin(payments, eq(payments.id, receipts.paymentId))
      .innerJoin(paymentAllocations, eq(paymentAllocations.paymentId, payments.id))
      .innerJoin(charges, eq(charges.id, paymentAllocations.chargeId))
      .innerJoin(leases, eq(leases.id, charges.leaseId))
      .innerJoin(units, eq(units.id, leases.unitId))
      .innerJoin(properties, eq(properties.id, units.propertyId))
      .innerJoin(parties, eq(parties.id, payments.payerPartyId))
      .orderBy(desc(receipts.issuedAt)),
  );

  return (
    <main>
      <p>
        <Link href="/">← Dashboard</Link>
      </p>
      <h1>Recibos</h1>

      {receiptsList.length === 0 ? (
        <p>Todavía no hay recibos emitidos.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Número</th>
              <th>Fecha</th>
              <th>Contrato</th>
              <th>Inquilino</th>
              <th>Importe</th>
              <th>Estado</th>
              <th>Copias</th>
              {(canReprint || canReverse) && <th></th>}
            </tr>
          </thead>
          <tbody>
            {receiptsList.map((receipt) => (
              <tr key={receipt.id}>
                <td>{receipt.receiptNumber}</td>
                <td>{new Date(receipt.issuedAt).toISOString().slice(0, 10)}</td>
                <td>
                  {receipt.leaseNumber} ({receipt.propertyName})
                </td>
                <td>{receipt.tenantName}</td>
                <td>
                  {receipt.amount} {receipt.currency}
                </td>
                <td>
                  {receipt.status}
                  {receipt.voidReason ? ` (${receipt.voidReason})` : ""}
                </td>
                <td>{receipt.reprintCount}</td>
                {(canReprint || canReverse) && (
                  <td>
                    {receipt.status === "issued" && (
                      <>
                        {canReprint && (
                          <form action={reprintReceiptAction} style={{ display: "inline" }}>
                            <input type="hidden" name="receiptId" value={receipt.id} />
                            <button type="submit">Reimprimir</button>
                          </form>
                        )}
                        {canReverse && (
                          <form action={reverseReceiptAction} style={{ display: "inline" }}>
                            <input type="hidden" name="receiptId" value={receipt.id} />
                            <input name="reason" placeholder="Motivo de anulación" required />
                            <button type="submit">Anular</button>
                          </form>
                        )}
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
