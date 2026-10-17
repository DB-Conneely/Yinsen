"use client";
import type { ReactElement } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
export function DashboardNavigation(): ReactElement {
  const pathname = usePathname();
  return (
    <nav aria-label="Workspace">
      <Link
        href="/dashboard"
        aria-current={pathname === "/dashboard" ? "page" : undefined}
      >
        Overview
      </Link>
      <Link
        href="/dashboard/clients"
        aria-current={
          pathname?.startsWith("/dashboard/clients") ? "page" : undefined
        }
      >
        Clients
      </Link>
      <Link href="/" className="public-nav">
        <span aria-hidden="true">↗</span>Public portal
      </Link>
    </nav>
  );
}
