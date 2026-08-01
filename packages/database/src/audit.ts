import type { Database } from "./client";
import { auditLog } from "./schema";

export interface AuditEventInput {
  organizationId: string;
  userId?: string | null;
  ipAddress?: string | null;
  sessionId?: string | null;
  correlationId?: string;
  entityType: string;
  entityId?: string | null;
  action: string;
  previousState?: unknown;
  newState?: unknown;
  reason?: string | null;
}

/**
 * Escribe una fila en audit_log (spec, sección 17). Llamar dentro de la
 * misma transacción que el cambio que se audita, para que ambos se
 * confirmen o reviertan juntos.
 */
export async function recordAuditEvent(db: Database, event: AuditEventInput) {
  await db.insert(auditLog).values({
    organizationId: event.organizationId,
    userId: event.userId ?? null,
    ipAddress: event.ipAddress ?? null,
    sessionId: event.sessionId ?? null,
    ...(event.correlationId ? { correlationId: event.correlationId } : {}),
    entityType: event.entityType,
    entityId: event.entityId ?? null,
    action: event.action,
    previousState: event.previousState ?? null,
    newState: event.newState ?? null,
    reason: event.reason ?? null,
  });
}
