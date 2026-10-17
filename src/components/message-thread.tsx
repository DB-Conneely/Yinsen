"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type FormEvent,
} from "react";
import { z } from "zod";
import { AppError } from "../lib/errors";
import type { Conversation } from "../lib/messages/access";
import type { Message, MessagePage } from "../lib/messages/queries";

const pageSchema = z.object({
  data: z
    .object({
      hasEarlier: z.boolean(),
      messages: z.array(
        z.object({
          id: z.uuid(),
          position: z.string(),
          body: z.string(),
          senderId: z.uuid(),
          senderType: z.enum(["operator", "client"]),
          senderName: z.string(),
          createdAt: z.string(),
          read: z.boolean(),
          attachments: z.array(
            z.object({
              id: z.uuid(),
              filename: z.string(),
              size: z.number(),
              mimeType: z.string(),
              sha256: z.string(),
            }),
          ),
        }),
      ),
    })
    .nullable(),
  error: z.object({ message: z.string() }).nullable(),
});

async function responsePage(response: Response): Promise<MessagePage> {
  const result = pageSchema.parse(await response.json());
  if (!response.ok || !result.data)
    throw new AppError(
      response.status,
      "MESSAGES_UNAVAILABLE",
      result.error?.message ?? "Messages could not be loaded. Please retry.",
    );
  return result.data;
}

function mergeMessages(old: Message[], next: Message[]): Message[] {
  const map = new Map(old.map((message) => [message.id, message]));
  for (const message of next) map.set(message.id, message);
  return [...map.values()].sort((a, b) =>
    BigInt(a.position) < BigInt(b.position) ? -1 : 1,
  );
}

function useVisibleReads(
  conversation: Conversation,
  messages: Message[],
  root: React.RefObject<HTMLElement | null>,
): { error: string; retry: () => void } {
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const mark = async (ids: string[]): Promise<void> => {
      try {
        const response = await fetch("/api/messages/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...conversation, ids }),
        });
        if (!response.ok)
          throw new AppError(
            response.status,
            "READ_FAILED",
            "Read status could not be saved. Retry when your connection recovers.",
          );
        setError("");
        window.dispatchEvent(new Event("yinsen:unread"));
      } catch {
        setError(
          "Read status could not be saved. Retry when your connection recovers.",
        );
      }
    };
    const observer = new IntersectionObserver(
      (entries) => {
        if (document.visibilityState !== "visible") return;
        const ids = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => {
            observer.unobserve(entry.target);
            return entry.target.getAttribute("data-unread-id") ?? "";
          })
          .filter(Boolean);
        if (ids.length) void mark(ids);
      },
      { threshold: 1 },
    );
    const observe = (): void => {
      for (const node of root.current?.querySelectorAll("[data-unread-id]") ??
        [])
        observer.observe(node);
    };
    observe();
    document.addEventListener("visibilitychange", observe);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", observe);
    };
  }, [conversation, messages, root, attempt]);
  return { error, retry: () => setAttempt((value) => value + 1) };
}

function MessageBubble({
  message,
  actorId,
}: {
  message: Message;
  actorId: string;
}): ReactElement {
  return (
    <article
      className={`message-bubble ${message.senderId === actorId ? "message-own" : ""}`}
    >
      <header>
        <strong>{message.senderName}</strong>
        <time dateTime={message.createdAt}>
          {new Date(message.createdAt).toLocaleString("en-GB", {
            timeZone: "UTC",
          })}{" "}
          UTC
        </time>
      </header>
      {message.body && <p className="preserve-lines">{message.body}</p>}
      {message.attachments.length > 0 && (
        <ul className="attachment-list">
          {message.attachments.map((file) => (
            <li key={file.id}>
              <a
                href={`/api/messages/${message.id}/attachments/${file.id}/download`}
              >
                {file.filename}
              </a>{" "}
              <small>{Math.ceil(file.size / 1024)} KB</small>
            </li>
          ))}
        </ul>
      )}
      <span
        className="message-seen-marker"
        aria-hidden="true"
        data-unread-id={
          !message.read && message.senderId !== actorId ? message.id : undefined
        }
      />
    </article>
  );
}

function MessageComposer({
  endpoint,
  maxBytes,
  onSent,
}: {
  endpoint: string;
  maxBytes: number;
  onSent: (page: MessagePage) => void;
}): ReactElement {
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const requestId = useRef("");
  const picker = useRef<HTMLInputElement>(null);
  function changed(): void {
    requestId.current = "";
    setError("");
  }
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!body.trim() && !files.length) {
      setError("Write a message or choose an attachment.");
      return;
    }
    if (files.length > 5 || files.some((file) => file.size > maxBytes)) {
      setError(
        `Choose up to five files, each no larger than ${maxBytes / 1024 / 1024} MB.`,
      );
      return;
    }
    requestId.current ||= crypto.randomUUID();
    const form = new FormData();
    form.set("requestId", requestId.current);
    form.set("body", body);
    for (const file of files) form.append("files", file);
    setPending(true);
    setError("");
    try {
      const page = await responsePage(
        await fetch(endpoint, { method: "POST", body: form }),
      );
      onSent(page);
      setBody("");
      setFiles([]);
      requestId.current = "";
      if (picker.current) picker.current.value = "";
      window.dispatchEvent(new Event("yinsen:unread"));
    } catch (failure: unknown) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Message could not be sent. Please retry.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <form
      className="message-composer"
      aria-label="Send a message"
      aria-busy={pending}
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <label>
        Message
        <textarea
          maxLength={4000}
          value={body}
          disabled={pending}
          onChange={(event) => {
            changed();
            setBody(event.target.value);
          }}
        />
      </label>
      <label>
        Attachments
        <input
          ref={picker}
          type="file"
          multiple
          disabled={pending}
          accept=".txt,.md,.csv,.pdf,.png,.jpg,.jpeg,.webp,.gif,.zip,.docx,.xlsx,.pptx"
          onChange={(event) => {
            changed();
            setFiles([...files, ...Array.from(event.target.files ?? [])]);
            event.target.value = "";
          }}
        />
      </label>
      <p className="field-help">
        Up to 5 files, {maxBytes / 1024 / 1024} MB each. Documents, text, images
        and ZIP files. Attachments are private to this conversation.
      </p>
      {files.length > 0 && (
        <ul className="attachment-list">
          {files.map((file, index) => (
            <li key={`${index}-${file.name}`}>
              <span>{file.name}</span>{" "}
              <button
                type="button"
                className="secondary"
                disabled={pending}
                onClick={() => {
                  changed();
                  setFiles(files.filter((_, position) => position !== index));
                }}
              >
                Remove {file.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p role="alert">{error}</p>
      <button disabled={pending}>
        {pending ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}

export function MessageThread({
  conversation,
  actorId,
  maxBytes,
}: {
  conversation: Conversation;
  actorId: string;
  maxBytes: number;
}): ReactElement {
  const [page, setPage] = useState<MessagePage>({
    messages: [],
    hasEarlier: false,
  });
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const root = useRef<HTMLElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const generation = useRef(0);
  const endpoint = `/api/${conversation.kind === "client" ? "clients" : "projects"}/${conversation.id}/messages`;
  const reads = useVisibleReads(conversation, page.messages, root);
  const lastMessageId = page.messages.at(-1)?.id;
  useEffect(() => {
    if (follow.current && list.current)
      list.current.scrollTop = list.current.scrollHeight;
  }, [lastMessageId]);
  const load = useCallback(
    (before?: string): Promise<void> => {
      const current = ++generation.current;
      const params = new URLSearchParams({
        search,
        ...(before ? { before } : {}),
      });
      return fetch(`${endpoint}?${params}`, { cache: "no-store" })
        .then(responsePage)
        .then((result) => {
          if (current !== generation.current) return;
          setPage((old) => ({
            messages: mergeMessages(old.messages, result.messages),
            hasEarlier:
              before || !old.messages.length
                ? result.hasEarlier
                : old.hasEarlier,
          }));
          setError("");
        })
        .catch((failure: unknown) => {
          if (current === generation.current)
            setError(
              failure instanceof Error
                ? failure.message
                : "Messages unavailable. Please retry.",
            );
        })
        .finally(() => {
          if (current === generation.current) setLoading(false);
        });
    },
    [endpoint, search],
  );
  useEffect(() => {
    void load();
    const refresh = (): void => {
      void load();
    };
    window.addEventListener("yinsen:refresh", refresh);
    return () => {
      window.removeEventListener("yinsen:refresh", refresh);
    };
  }, [load]);
  const sent = (result: MessagePage): void => {
    setSearch("");
    setPage(result);
    requestAnimationFrame(() => {
      if (list.current) list.current.scrollTop = list.current.scrollHeight;
    });
  };
  return (
    <section
      className="card message-thread"
      id="messages"
      ref={root}
      aria-label="Conversation"
    >
      <div className="page-heading">
        <div>
          <p className="eyebrow">Conversation</p>
          <h2>
            {conversation.kind === "client"
              ? "General messages"
              : "Project messages"}
          </h2>
        </div>
      </div>
      <form
        role="search"
        className="search-toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          const value = new FormData(event.currentTarget).get("search");
          const next = typeof value === "string" ? value : "";
          setLoading(true);
          setPage({ messages: [], hasEarlier: false });
          if (next === search) void load();
          else setSearch(next);
        }}
      >
        <label>
          Search messages
          <input name="search" maxLength={100} defaultValue={search} />
        </label>
        <button className="secondary">Search</button>
      </form>
      {page.hasEarlier && (
        <button
          className="secondary"
          disabled={loading}
          onClick={() => {
            setLoading(true);
            void load(page.messages[0]?.position);
          }}
        >
          Load earlier messages
        </button>
      )}
      <p role="status">
        {loading
          ? "Loading messages…"
          : page.messages.length
            ? ""
            : search
              ? "No matching messages."
              : "No messages yet. Start the conversation below."}
      </p>
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button
            className="secondary"
            onClick={() => {
              void load();
            }}
          >
            Retry messages
          </button>
        </div>
      )}
      <div
        className="message-list"
        ref={list}
        onScroll={(event) => {
          const node = event.currentTarget;
          follow.current =
            node.scrollHeight - node.scrollTop - node.clientHeight < 80;
        }}
      >
        {page.messages.map((message) => (
          <MessageBubble key={message.id} message={message} actorId={actorId} />
        ))}
      </div>
      {reads.error && (
        <div role="alert">
          <p>{reads.error}</p>
          <button className="secondary" onClick={reads.retry}>
            Retry read status
          </button>
        </div>
      )}
      <MessageComposer endpoint={endpoint} maxBytes={maxBytes} onSent={sent} />
    </section>
  );
}
