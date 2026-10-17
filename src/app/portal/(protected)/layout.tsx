import type { ReactElement, ReactNode } from "react";
import { redirect } from "next/navigation";
import { clientForPage } from "../../../lib/auth/client-page";
import { getBranding } from "../../../lib/settings";
import { BrandFrame } from "../../../components/brand";
import { LogoutButton } from "../../../components/auth-forms";
export const dynamic = "force-dynamic";
export default async function PortalLayout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactElement> {
  await clientForPage();
  const branding = await getBranding();
  if (!branding) redirect("/setup");
  return (
    <BrandFrame branding={branding}>
      <main>
        <nav className="actions">
          <a href="/portal">Your account</a>
          <LogoutButton destination="/portal/login" />
        </nav>
        {children}
      </main>
    </BrandFrame>
  );
}
