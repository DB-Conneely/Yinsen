"use client";
import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export function ProjectLive({
  projectId,
  children,
}: {
  projectId?: string;
  children: ReactNode;
}): ReactElement {
  const router = useRouter();
  const [connection, setConnection] = useState("Connecting to live updates…");
  useEffect(() => {
    const source = new EventSource(
      `/api/events${projectId ? `?projectId=${projectId}` : ""}`,
    );
    source.onopen = (): void => {
      setConnection("Live updates connected");
      router.refresh();
    };
    source.addEventListener("refresh", () => {
      router.refresh();
    });
    source.addEventListener("revoked", () => {
      setConnection("Access changed. Return to your workspace to continue.");
      source.close();
      router.refresh();
    });
    source.addEventListener("unavailable", () => {
      setConnection(
        "Updates unavailable. Check your connection and refresh this page.",
      );
      source.close();
    });
    source.onerror = (): void => {
      setConnection("Reconnecting to live updates…");
    };
    return () => {
      source.close();
    };
  }, [projectId, router]);
  const visible =
    connection === "Live updates connected" ||
    connection === "Connecting to live updates…";
  return (
    <>
      <p className="live-status" role="status">
        {connection}
      </p>
      {visible ? (
        children
      ) : (
        <button onClick={() => window.location.reload()}>
          Reload workspace
        </button>
      )}
    </>
  );
}
