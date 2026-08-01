import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Farfalla Asset & Property Management",
  description: "Administración y gestión patrimonial inmobiliaria",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-UY">
      <body>{children}</body>
    </html>
  );
}
