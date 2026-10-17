"use client";
import type { ReactElement } from "react";
export default function ClientError({
  reset,
}: {
  reset: () => void;
}): ReactElement {
  return (
    <section role="alert">
      <h2>Unable to load clients</h2>
      <p>Check the connection and try again.</p>
      <button onClick={reset}>Try again</button>
    </section>
  );
}
