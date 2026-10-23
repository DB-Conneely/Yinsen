"use client";
import {
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactElement,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

export const MessageRefreshContext = createContext({
  refreshing: false,
  setDraft: (_value: boolean): void => undefined,
});

function useDraftSafeRefresh(): {
  refreshing: boolean;
  setDraft: (value: boolean) => void;
  refresh: () => void;
} {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const draft = useRef(false);
  const queued = useRef(false);
  const refresh = useCallback(() => {
    queued.current = true;
    if (draft.current || !navigator.onLine) return;
    queued.current = false;
    startTransition(() => router.refresh());
  }, [router]);
  const setDraft = useCallback(
    (value: boolean) => {
      draft.current = value;
      if (!value && queued.current) refresh();
    },
    [refresh],
  );
  useEffect(() => {
    window.addEventListener("online", refresh);
    return () => window.removeEventListener("online", refresh);
  }, [refresh]);
  return { refreshing, setDraft, refresh };
}

function useProjectConnection({
  projectId,
  clientId,
  refresh,
}: {
  projectId?: string;
  clientId?: string;
  refresh: () => void;
}): string {
  const router = useRouter();
  const [connection, setConnection] = useState("");
  useEffect(() => {
    const source = new EventSource(
      `/api/events${projectId ? `?projectId=${projectId}` : clientId ? `?clientId=${clientId}` : ""}`,
    );
    source.onopen = (): void => {
      setConnection("");
    };
    source.addEventListener("refresh", () => {
      window.dispatchEvent(new Event("yinsen:refresh"));
      refresh();
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
  }, [projectId, clientId, router, refresh]);
  return connection;
}

export function ProjectLive({
  projectId,
  clientId,
  children,
}: {
  projectId?: string;
  clientId?: string;
  children: ReactNode;
}): ReactElement {
  const { refreshing, setDraft, refresh } = useDraftSafeRefresh();
  const connection = useProjectConnection({ projectId, clientId, refresh });
  const visible = !connection.startsWith("Access changed.");
  return (
    <MessageRefreshContext value={{ refreshing, setDraft }}>
      {connection && (
        <p className="live-status" role="status">
          {connection}
        </p>
      )}
      {visible ? (
        children
      ) : (
        <button onClick={() => window.location.reload()}>
          Reload workspace
        </button>
      )}
    </MessageRefreshContext>
  );
}
