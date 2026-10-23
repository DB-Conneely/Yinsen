import type { ReactElement } from "react";
import Link from "next/link";
import { ThemeToggle } from "../components/theme-toggle";

export default function NotFound(): ReactElement {
  return (
    <main className="card narrow not-found" id="main-content">
      <ThemeToggle />
      <p className="eyebrow">404</p>
      <h1>Page not found</h1>
      <p>This page is unavailable or you do not have access.</p>
      <Link href="/" className="button secondary">
        Return to portal
      </Link>
    </main>
  );
}
