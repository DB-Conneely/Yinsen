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
        For commands and configuration details, open{" "}
        <code>docs/operator.md</code> in your installation source.
      </p>
      <a href="/setup">Back to setup</a>
    </main>
  );
}
