import type { ReactElement } from "react";

export default function Home(): ReactElement {
  return (
    <main>
      <h1>Your client portal</h1>
      <p>The application is running.</p>
      <p>
        <a href="/api/health">Check service health</a>
      </p>
    </main>
  );
}
