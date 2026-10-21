import type { ReactElement, ReactNode } from "react";
import { redirect } from "next/navigation";
import { clientForPage } from "../../../lib/auth/client-page";
import { getBranding } from "../../../lib/settings";
import { BrandFrame } from "../../../components/brand";
import { LogoutButton } from "../../../components/auth-forms";
import { DashboardNavigation } from "../../../components/dashboard-nav";
export const dynamic = "force-dynamic";
export default async function PortalLayout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactElement> {
  const identity = await clientForPage();
  const branding = await getBranding();
  if (!branding) redirect("/setup");
  return (
    <BrandFrame branding={branding}>
      <div className="dashboard portal-shell">
        <aside className="workspace-sidebar" aria-label="Client navigation">
          <div className="workspace-sidebar-content">
            <p className="nav-label">Client portal</p>
            <DashboardNavigation role="client" />
            <div className="sidebar-account">
              <div className="operator-profile">
                <div>
                  <strong>{identity.name}</strong>
                  <span>Client account</span>
                </div>
              </div>
              <LogoutButton destination="/portal/login" />
            </div>
          </div>
        </aside>
        <main className="workspace-content" id="main-content">
          {children}
        </main>
      </div>
    </BrandFrame>
  );
}
