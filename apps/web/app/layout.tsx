import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Farfalla Asset & Property Management",
  description: "Administración y gestión patrimonial inmobiliaria",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-UY">
      <body>
        <div className="app-shell">
          <header className="app-header">
            <span className="app-header__mark">F</span>
            <span className="app-header__brand">Farfalla</span>
            <span className="app-header__tagline">Asset &amp; Property Management</span>
          </header>
          <div className="app-content">{children}</div>
        </div>
      </body>
    </html>
  );
}
