import type { ReactElement, ReactNode } from "react";
import { redirect } from "next/navigation";
import { getBranding } from "../../lib/settings";
import { operatorForPage } from "../../lib/auth/page";
import { BrandFrame } from "../../components/brand";
import { LogoutButton } from "../../components/auth-forms";
import Link from "next/link";

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
        <aside aria-label="Operator navigation">
          <nav>
            <Link href="/dashboard" aria-current="page">
              Overview
            </Link>
            <Link href="/">Public portal</Link>
          </nav>
          <p>{identity.name}</p>
          <LogoutButton />
        </aside>
        <main>{children}</main>
      </div>
    </BrandFrame>
  );
}
