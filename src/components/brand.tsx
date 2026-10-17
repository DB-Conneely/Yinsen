import type { CSSProperties, ReactElement, ReactNode } from "react";
import type { Branding } from "../lib/settings";
import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";

export function BrandFrame({
  branding,
  children,
}: {
  branding: Branding;
  children: ReactNode;
}): ReactElement {
  // CAST: CSS custom properties accept the validated hexadecimal branding colour.
  return (
    <div
      className="brand-frame"
      style={{ "--brand-colour": branding.brandColour } as CSSProperties}
    >
      <header className="brand-header">
        <Link href="/" className="brand-name">
          {branding.brandName}
        </Link>
        <div className="header-tools">
          <span className="currency-badge">{branding.defaultCurrency}</span>
          <ThemeToggle />
        </div>
      </header>
      {children}
      <footer>{branding.brandName} · Powered by Yinsen</footer>
    </div>
  );
}
