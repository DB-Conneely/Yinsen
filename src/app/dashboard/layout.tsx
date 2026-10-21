import type { ReactElement, ReactNode } from "react";
import { redirect } from "next/navigation";
import { getBranding } from "../../lib/settings";
import { operatorForPage } from "../../lib/auth/page";
import { BrandFrame } from "../../components/brand";
import { LogoutButton } from "../../components/auth-forms";
import { DashboardNavigation } from "../../components/dashboard-nav";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactElement> {
  const branding = await getBranding();
  if (!branding) redirect("/setup");
  const identity = await operatorForPage();
  return (
    <BrandFrame branding={branding}>
      <div className="dashboard">
        <aside className="workspace-sidebar" aria-label="Operator navigation">
          <div className="workspace-sidebar-content">
            <p className="nav-label">Workspace</p>
            <DashboardNavigation />
            <div className="sidebar-account">
              <div className="operator-profile">
                <div>
                  <strong>{identity.name}</strong>
                  <span>Operator account</span>
                </div>
              </div>
              <LogoutButton />
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
