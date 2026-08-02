import "next-auth";
import "next-auth/jwt";

// Cubre el typecheck interno de este paquete (config.ts). No se puede
// re-exportar vía un import de solo efectos secundarios desde index.ts:
// un .d.ts puro no tiene módulo runtime que Next/Turbopack pueda
// resolver al bundlear. Cada app consumidora que lea
// `session.externalAuthSubject` necesita su propia copia de esta
// augmentation (ver apps/web/types/next-auth.d.ts).
declare module "next-auth" {
  interface Session {
    externalAuthSubject?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    externalAuthSubject?: string;
  }
}
