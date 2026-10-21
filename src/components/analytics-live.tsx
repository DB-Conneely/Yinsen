"use client";
import { useEffect, useTransition, type ReactElement } from "react";
import { useRouter } from "next/navigation";

export function AnalyticsLive(): ReactElement {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    const refresh = (): void => startTransition(() => router.refresh());
    window.addEventListener("yinsen:refresh", refresh);
    window.addEventListener("yinsen:unread", refresh);
    return () => {
      window.removeEventListener("yinsen:refresh", refresh);
      window.removeEventListener("yinsen:unread", refresh);
    };
  }, [router]);
  return (
    <span className="analytics-refresh" role="status">
      {pending ? "Updating overview…" : "Updates with your workspace"}
    </span>
  );
}
