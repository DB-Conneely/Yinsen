import type { ReactElement } from "react";
import { operatorForPage } from "../../lib/auth/page";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Operator dashboard" };

export default async function Dashboard(): Promise<ReactElement> {
  const identity = await operatorForPage();
  return (
    <>
      <p className="eyebrow">Overview</p>
      <h1>Welcome, {identity.name}</h1>
      <p>Your workspace for client relationships and secure portal access.</p>
      <div className="overview-links">
        <Link href="/dashboard/projects" className="card">
          <p className="eyebrow">Shared work</p>
          <h2>
            Open your projects <span aria-hidden="true">↗</span>
          </h2>
          <p>Agree scope, organise milestones and keep work moving.</p>
        </Link>
        <Link href="/dashboard/clients" className="card">
          <p className="eyebrow">Client directory</p>
          <h2>
            Manage your clients <span aria-hidden="true">↗</span>
          </h2>
          <p>
            Keep contact details in one place, share login links and manage
            access.
          </p>
        </Link>
        <Link href="/" className="card">
          <p className="eyebrow">Your brand</p>
          <h2>
            Open your public portal <span aria-hidden="true">↗</span>
          </h2>
          <p>See the welcome your clients receive, with your own branding.</p>
        </Link>
      </div>
    </>
  );
}
