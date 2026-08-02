import { can, type UserContext } from "@farfalla/auth";
import { getDb } from "./db";

/**
 * Autorización del lado servidor para el alcance de organización
 * completa (spec, sección 18.1: nunca solo en la UI). Las pantallas de
 * Hito 2 no manejan todavía alcance por familia/propiedad específica.
 */
export async function hasPermission(context: UserContext, resource: string, action: string) {
  return can(getDb(), {
    userId: context.userId,
    organizationId: context.organizationId,
    resource,
    action,
    scope: { type: "organization" },
  });
}
