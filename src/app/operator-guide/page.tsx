import type { ReactElement } from "react";
import { ThemeToggle } from "../../components/theme-toggle";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Installation configuration" };

export default function OperatorGuide(): ReactElement {
  return (
    <main className="card">
      <div className="setup-toolbar">
        <Link href="/">Your portal</Link>
        <ThemeToggle />
      </div>
      <h1>Installation configuration</h1>
      <p>
        Database credentials and the public origin come from your server
        environment. Keep credentials private and restart the application after
        changing them.
      </p>
      <p>
        Setup needs no email, payment or storage service. The database check
        verifies a live connection and current migrations. Optional integrations
        are added alongside their usable features.
      </p>
      <p>
        For commands and configuration details, open <code>README.md</code> in
        your installation source.
      </p>
      <h2>Online invoice payment</h2>
      <p>
        Direct Stripe card payment uses STRIPE_SECRET_KEY and
        STRIPE_WEBHOOK_SECRET together. Keep both on the server. Register
        /api/webhooks/stripe with the event names and API version in
        .env.example. Restart after configuration changes. Setup checks account
        access; a real payment is needed to verify webhook delivery.
      </p>
      <p>
        Without Stripe, share invoice links and record full manual settlement.
        Returning from Checkout does not confirm payment. Review unresolved
        Checkout attempts and payment exceptions in the operator invoice
        workspace, consult Stripe and record any external resolution there.
      </p>
      <a href="/setup">Back to setup</a>
    </main>
  );
}
