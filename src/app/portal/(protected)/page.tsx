import type { ReactElement } from "react";
import { clientForPage } from "../../../lib/auth/client-page";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Your account" };

export default async function PortalPage(): Promise<ReactElement> {
  const identity = await clientForPage();
  return (
    <section className="card portal-welcome">
      <p className="eyebrow">Client portal</p>
      <h1>Welcome, {identity.name}</h1>
      <p>You are signed in as {identity.email}.</p>
      <p>
        <Link href="/portal/projects">Open your projects</Link> to review shared
        scope and milestones.
      </p>
    </section>
  );
}
