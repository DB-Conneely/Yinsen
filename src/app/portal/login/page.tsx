import type { ReactElement } from "react";
import { redirect } from "next/navigation";
import { getBranding } from "../../../lib/settings";
import { BrandFrame } from "../../../components/brand";
import { readConfiguration } from "../../../lib/config";
import { ClientLoginForm } from "../../../components/client-auth";

export const dynamic = "force-dynamic";

export default async function ClientLogin(): Promise<ReactElement> {
  const branding = await getBranding();
  if (!branding) redirect("/setup");
  return (
    <BrandFrame branding={branding}>
      <main className="card narrow">
        <h1>Client login</h1>
        <p>Contact {branding.brandName} for a login link.</p>
        {readConfiguration().email && <ClientLoginForm />}
        <p>
          <a href="/login">Operator login</a>
        </p>
      </main>
    </BrandFrame>
  );
}
