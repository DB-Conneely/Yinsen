import type { ReactElement } from "react";
import { redirect } from "next/navigation";
import { getBranding } from "../../lib/settings";
import { BrandFrame } from "../../components/brand";
import { LoginForm } from "../../components/auth-forms";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Operator login" };

export const dynamic = "force-dynamic";

export default async function Login(): Promise<ReactElement> {
  const branding = await getBranding();
  if (!branding) redirect("/setup");
  return (
    <BrandFrame branding={branding}>
      <main className="card narrow" id="main-content">
        <h1>Operator login</h1>
        <p>Welcome back to {branding.brandName}.</p>
        <LoginForm />
        <p>
          <a href="/portal/login">Client login</a>
        </p>
      </main>
    </BrandFrame>
  );
}
