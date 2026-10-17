import type { ReactElement } from "react";
import { redirect } from "next/navigation";
import { getBranding } from "../lib/settings";
import { BrandFrame } from "../components/brand";

export const dynamic = "force-dynamic";

export default async function Home(): Promise<ReactElement> {
  const branding = await getBranding();
  if (!branding) redirect("/setup");
  return (
    <BrandFrame branding={branding}>
      <main className="hero">
        <p className="eyebrow">Your client portal</p>
        <h1>{branding.brandName}</h1>
        <p>{branding.welcomeText}</p>
        <div className="actions">
          <a className="button" href="/portal/login">
            Client login
          </a>
          <a href="/login">Operator login</a>
        </div>
      </main>
    </BrandFrame>
  );
}
