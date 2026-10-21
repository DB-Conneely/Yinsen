import type { CSSProperties, ReactElement, ReactNode } from "react";
import type { Branding } from "../lib/settings";
import Link from "next/link";
import Image from "next/image";
import { ThemeToggle } from "./theme-toggle";
import { appearanceStyle } from "../lib/appearance";

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
      style={
        {
          ...appearanceStyle(branding, branding.brandColour),
          "--brand-colour": branding.brandColour,
        } as CSSProperties
      }
    >
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="brand-header">
        <Link href="/" className="brand-name">
          {branding.logoId && (
            <Image
              unoptimized
              className="brand-logo"
              src={`/api/branding/logo/${branding.logoId}`}
              alt=""
              width={40}
              height={40}
            />
          )}
          <span className="brand-label">{branding.brandName}</span>
        </Link>
        <div className="header-tools">
          <span className="currency-badge">{branding.defaultCurrency}</span>
          <ThemeToggle />
        </div>
      </header>
      {children}
      <footer className="brand-footer">
        <div>
          <strong>{branding.brandName}</strong>
          {branding.contactEmail && (
            <a href={`mailto:${branding.contactEmail}`}>
              {branding.contactEmail}
            </a>
          )}
          {branding.contactPhone && <span>{branding.contactPhone}</span>}
          {branding.businessAddress && (
            <span className="preserve-lines">{branding.businessAddress}</span>
          )}
          {branding.website && (
            <a href={branding.website} rel="noopener noreferrer">
              Website ↗
            </a>
          )}
        </div>
        <span>Powered by Yinsen</span>
      </footer>
    </div>
  );
}
