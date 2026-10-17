"use client";
import { useEffect, useState, type ReactElement } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { z } from "zod";
import { AppError } from "../lib/errors";
import type { ConversationSummary } from "../lib/messages/queries";

const summarySchema = z.object({
  data: z.object({
    total: z.number(),
    conversations: z.array(
      z.object({
        kind: z.enum(["client", "project"]),
        id: z.uuid(),
        name: z.string(),
        unread: z.number(),
        lastBody: z.string(),
        lastAt: z.string().nullable(),
      }),
    ),
  }),
});

export function MessageNotifications({
  role,
}: {
  role: "operator" | "client";
}): ReactElement {
  const pathname = usePathname();
  const [summary, setSummary] = useState<{
    total: number;
    conversations: ConversationSummary[];
  }>({ total: 0, conversations: [] });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    let previous: number | undefined;
    const refresh = async (): Promise<void> => {
      try {
        const response = await fetch("/api/messages", { cache: "no-store" });
        if (!response.ok)
          throw new AppError(
            response.status,
            "NOTIFICATIONS_UNAVAILABLE",
            "Message notifications unavailable",
          );
        const data = summarySchema.parse(await response.json()).data;
        if (active) {
          if (previous !== undefined && data.total > previous)
            setNotice("New message received.");
          previous = data.total;
          setSummary(data);
          setError("");
        }
      } catch {
        if (active)
          setError("Message notifications unavailable. Refresh to retry.");
      }
    };
    const source = new EventSource("/api/events");
    const changed = (): void => {
      void refresh();
      window.dispatchEvent(new Event("yinsen:refresh"));
    };
    source.addEventListener("refresh", changed);
    source.onopen = changed;
    source.addEventListener("revoked", () => {
      setSummary({ total: 0, conversations: [] });
      source.close();
      window.location.assign(role === "operator" ? "/login" : "/portal/login");
    });
    source.addEventListener("unavailable", () => {
      setError("Message notifications unavailable. Refresh to retry.");
      source.close();
    });
    const read = (): void => {
      void refresh();
    };
    window.addEventListener("yinsen:unread", read);
    void refresh();
    return () => {
      active = false;
      source.close();
      window.removeEventListener("yinsen:unread", read);
    };
  }, [role]);
  const unread = summary.conversations.filter((item) => item.unread > 0);
  return (
    <div className="message-notifications">
      {role === "client" && (
        <Link
          href="/portal/messages"
          aria-current={pathname === "/portal/messages" ? "page" : undefined}
        >
          Messages
          {summary.total > 0 && (
            <span className="unread-badge">{summary.total} unread</span>
          )}
        </Link>
      )}
      <details>
        <summary>
          Notifications <span className="unread-badge">{summary.total}</span>
        </summary>
        {unread.length ? (
          <ul>
            {unread.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <Link
                  href={
                    item.kind === "project"
                      ? `/${role === "operator" ? "dashboard" : "portal"}/projects/${item.id}#messages`
                      : role === "operator"
                        ? `/dashboard/clients/${item.id}#messages`
                        : "/portal/messages"
                  }
                >
                  {item.name} · {item.unread} unread
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p>No unread messages.</p>
        )}
        {error && <p role="alert">{error}</p>}
      </details>
      <span className="sr-only" role="status">
        {notice}
      </span>
    </div>
  );
}
