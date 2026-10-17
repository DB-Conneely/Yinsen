import type { ReactElement } from "react";
import { redirect } from "next/navigation";
import { getBranding } from "../../../lib/settings";
import { BrandFrame } from "../../../components/brand";
import { VerifyClientLink } from "../../../components/client-auth";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Confirm client login" };

export const dynamic = "force-dynamic";
export default async function VerifyPage(): Promise<ReactElement> {
  const branding = await getBranding();
  if (!branding) redirect("/setup");
  return (
    <BrandFrame branding={branding}>
      <main className="card narrow auth-shell" id="main-content">
        <h1>Sign in to your portal</h1>
        <VerifyClientLink />
      </main>
    </BrandFrame>
  );
}
