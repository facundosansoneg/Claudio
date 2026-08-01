import { resolveUserContext, type UserContext } from "@farfalla/auth";
import { auth } from "@/auth";
import { getDb } from "./db";

/**
 * Resuelve organización, usuario y roles del usuario autenticado en la
 * request actual. Devuelve null si no hay sesión o si el "oid" de Entra
 * ID todavía no tiene una identidad registrada en `user_identities`
 * (alta pendiente por un administrador).
 */
export async function getCurrentUserContext(): Promise<UserContext | null> {
  const session = await auth();
  if (!session?.externalAuthSubject) return null;
  return resolveUserContext(getDb(), session.externalAuthSubject);
}
