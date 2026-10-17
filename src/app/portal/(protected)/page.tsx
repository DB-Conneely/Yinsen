import type { ReactElement } from "react";
import { clientForPage } from "../../../lib/auth/client-page";
export default async function PortalPage(): Promise<ReactElement> {
  const identity = await clientForPage();
  return (
    <section className="card">
      <p className="eyebrow">Client portal</p>
      <h1>Welcome, {identity.name}</h1>
      <p>You are signed in as {identity.email}.</p>
      <p>Your private client account is ready.</p>
    </section>
  );
}
