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
        verifies a live connection and current migrations. Optional Resend
        email, direct Stripe payment and private S3-compatible storage use
        server environment configuration. Without them, use manual client links,
        full manual settlement and persistent local files. Never put credentials
        in browser settings.
      </p>
      <h2>Branding and account settings</h2>
      <p>
        <Link href="/dashboard/settings">Open operator settings</Link> to change
        branding, public business contact details, welcome copy, future currency
        defaults, invoice numbering/instructions, appearance and account
        security. Saved business settings apply on the next page load; no
        restart is needed. Your personal light/dark/system choice stays in this
        browser. Issued invoices retain their original identity, currency,
        instructions and logo. Uploaded logos are public; attachments and
        deliverables remain private.
      </p>
      <p>
        Allow automatic updates saves permission only and defaults to off.
        Saving starts no update. A deployment service must be configured
        separately.
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
