import "next-auth";
import "next-auth/jwt";

// Espeja la extensión de packages/auth/src/types.d.ts: TypeScript no
// propaga augmentations de módulo entre paquetes salvo que el archivo
// .d.ts esté incluido en el program de cada consumidor, y un import de
// solo-tipos de un .d.ts puro rompe el bundling de Next/Turbopack. Cada
// app que lee `session.externalAuthSubject` declara esto localmente.
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
