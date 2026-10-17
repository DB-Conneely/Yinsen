import type { CSSProperties, ReactElement, ReactNode } from "react";
import type { Branding } from "../lib/settings";
import Link from "next/link";

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
        <span>{branding.defaultCurrency}</span>
      </header>
      {children}
      <footer>{branding.brandName} · Powered by Yinsen</footer>
    </div>
  );
}
