"use client";
import type { ReactElement } from "react";
export default function ProjectError({
  retry,
}: {
  retry: () => void;
}): ReactElement {
  return (
    <section role="alert">
      <h2>Unable to load projects</h2>
      <p>Check the connection and try again.</p>
      <button onClick={retry}>Try again</button>
    </section>
  );
}
