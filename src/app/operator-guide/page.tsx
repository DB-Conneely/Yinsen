import type { ReactElement } from "react";

export default function OperatorGuide(): ReactElement {
  return (
    <main className="card">
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
