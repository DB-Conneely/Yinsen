"use client";
import { useRef, useState, type ReactElement, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageNotifications } from "./message-notifications";

const operatorPages = [
  ["Overview", "/dashboard"],
  ["Clients", "/dashboard/clients"],
  ["Projects", "/dashboard/projects"],
  ["Invoices", "/dashboard/invoices"],
  ["Analytics", "/dashboard/analytics"],
  ["Settings", "/dashboard/settings"],
] as const;
const clientPages = [
  ["Your account", "/portal"],
  ["Projects", "/portal/projects"],
  ["Invoices", "/portal/invoices"],
] as const;

function WorkspaceMenu({
  current,
  children,
}: {
  current: string;
  children: ReactNode;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  return (
    <div
      className="workspace-navigation"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          toggle.current?.focus();
        }
      }}
    >
      <button
        ref={toggle}
        type="button"
        className="workspace-menu-toggle secondary"
        aria-expanded={open}
        aria-controls="workspace-navigation"
        onClick={() => setOpen(!open)}
      >
        <span>{current}</span>
        <span>
          Menu <span aria-hidden="true">{open ? "−" : "+"}</span>
        </span>
      </button>
      <nav
        id="workspace-navigation"
        className="workspace-nav"
        aria-label="Workspace"
        data-open={open}
        onClick={(event) => {
          if (event.target instanceof Element && event.target.closest("a"))
            setOpen(false);
        }}
      >
        {children}
      </nav>
    </div>
  );
}

export function DashboardNavigation({
  role = "operator",
}: {
  role?: "operator" | "client";
}): ReactElement {
  const pathname = usePathname();
  const pages = role === "operator" ? operatorPages : clientPages;
  const active = pages.find(([, href], index) =>
    index === 0 ? pathname === href : pathname?.startsWith(href),
  );
  const current =
    active?.[0] ?? (pathname === "/portal/messages" ? "Messages" : "Workspace");
  return (
    <WorkspaceMenu current={current}>
      {pages.map(([label, href]) => (
        <Link
          key={href}
          href={href}
          aria-current={active?.[1] === href ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
      <MessageNotifications role={role} />
      {role === "operator" && (
        <Link href="/" className="public-nav">
          <span aria-hidden="true">↗</span>Public portal
        </Link>
      )}
    </WorkspaceMenu>
  );
}
