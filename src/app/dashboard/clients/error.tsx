"use client";
import type { ReactElement } from "react";
export default function ClientError({
  retry,
}: {
  retry: () => void;
}): ReactElement {
  return (
    <section role="alert">
      <h2>Unable to load clients</h2>
      <p>Check the connection and try again.</p>
      <button onClick={retry}>Try again</button>
    </section>
  );
}
