"use client";
import type { ReactElement } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageNotifications } from "./message-notifications";
export function DashboardNavigation({
  role = "operator",
}: {
  role?: "operator" | "client";
}): ReactElement {
  const pathname = usePathname();
  const root = role === "operator" ? "/dashboard" : "/portal";
  return (
    <nav className="workspace-nav" aria-label="Workspace">
      <Link href={root} aria-current={pathname === root ? "page" : undefined}>
        {role === "operator" ? "Overview" : "Your account"}
      </Link>
      {role === "operator" && (
        <Link
          href="/dashboard/clients"
          aria-current={
            pathname?.startsWith("/dashboard/clients") ? "page" : undefined
          }
        >
          Clients
        </Link>
      )}
      <Link
        href={`${root}/projects`}
        aria-current={
          pathname?.startsWith(`${root}/projects`) ? "page" : undefined
        }
      >
        Projects
      </Link>
      <Link
        href={`${root}/invoices`}
        aria-current={
          pathname?.startsWith(`${root}/invoices`) ? "page" : undefined
        }
      >
        Invoices
      </Link>
      {role === "operator" && (
        <Link
          href="/dashboard/analytics"
          aria-current={
            pathname?.startsWith("/dashboard/analytics") ? "page" : undefined
          }
        >
          Analytics
        </Link>
      )}
      <MessageNotifications role={role} />
      {role === "operator" && (
        <Link
          href="/dashboard/settings"
          aria-current={
            pathname?.startsWith("/dashboard/settings") ? "page" : undefined
          }
        >
          Settings
        </Link>
      )}
      {role === "operator" && (
        <Link href="/" className="public-nav">
          <span aria-hidden="true">↗</span>Public portal
        </Link>
      )}
    </nav>
  );
}
