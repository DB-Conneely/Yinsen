"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type FormEvent,
} from "react";
import { z } from "zod";
import { AppError } from "../lib/errors";
import type { Conversation } from "../lib/messages/access";
import type { Message, MessagePage } from "../lib/messages/queries";
import {
  proposalAction as proposalActionSchema,
  proposalView,
} from "../lib/messages/proposal-validators";
import { ProposalCard } from "./proposal-card";
import { ProposalEditor } from "./proposal-editor";

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
          type: z.enum(["message", "proposal", "counter", "accept", "reject"]),
          proposal: proposalView.nullable(),
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
  operator,
  submitAction,
  onSaved,
}: {
  message: Message;
  actorId: string;
  operator: boolean;
  submitAction: (input: unknown) => Promise<MessagePage>;
  onSaved: (requestId: string) => void;
}): ReactElement {
  return (
    <article
      id={`message-${message.id}`}
      tabIndex={-1}
      className={`message-bubble ${message.senderId === actorId ? "message-own" : ""} ${message.proposal ? "message-proposal" : ""}`}
    >
      <header className="message-meta">
        <strong>{message.senderName}</strong>
        <time dateTime={message.createdAt}>
          {new Date(message.createdAt).toLocaleString("en-GB", {
            timeZone: "UTC",
          })}{" "}
          UTC
        </time>
      </header>
      {message.body && !message.proposal && (
        <p className="preserve-lines">{message.body}</p>
      )}
      <ProposalCard
        message={message}
        operator={operator}
        submitAction={submitAction}
        onSaved={onSaved}
      />
      {message.attachments.length > 0 && (
        <ul className="attachment-list message-downloads">
          {message.attachments.map((file) => (
            <li key={file.id}>
              <a
                aria-label={file.filename}
                href={`/api/messages/${message.id}/attachments/${file.id}/download`}
              >
                <span className="attachment-icon" aria-hidden="true">
                  ↓
                </span>
                <span className="attachment-name">
                  {file.filename}
                  <small>{Math.ceil(file.size / 1024)} KB · Download</small>
                </span>
              </a>
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
          placeholder="Write a message…"
          maxLength={4000}
          value={body}
          disabled={pending}
          onChange={(event) => {
            changed();
            setBody(event.target.value);
          }}
        />
      </label>
      <div className="composer-tools">
        <label className="attachment-picker">
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
        <button disabled={pending}>
          {pending ? "Sending…" : "Send message"}
          <span aria-hidden="true">↗</span>
        </button>
      </div>
      <p className="field-help attachment-help">
        Up to 5 files, {maxBytes / 1024 / 1024} MB each. Documents, text, images
        and ZIP files. Attachments are private to this conversation.
      </p>
      {files.length > 0 && (
        <ul className="attachment-list selected-attachments">
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
    </form>
  );
}

export function MessageThread({
  conversation,
  actorId,
  maxBytes,
  operator = false,
  defaultCurrency,
}: {
  conversation: Conversation;
  actorId: string;
  maxBytes: number;
  operator?: boolean;
  defaultCurrency: string;
}): ReactElement {
  const [page, setPage] = useState<MessagePage>({
    messages: [],
    hasEarlier: false,
  });
  const [search, setSearch] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [savedProposalId, setSavedProposalId] = useState("");
  const [focusRequest, setFocusRequest] = useState<{ id: string } | null>(null);
  const focusedRequest = useRef<{ id: string } | null>(null);
  const [proposing, setProposing] = useState(false);
  const proposeTrigger = useRef<HTMLButtonElement>(null);
  const loadedFrom = useRef<string | undefined>(undefined);
  const root = useRef<HTMLElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const generation = useRef(0);
  const endpoint = `/api/${conversation.kind === "client" ? "clients" : "projects"}/${conversation.id}/messages`;
  const reads = useVisibleReads(conversation, page.messages, root);
  const lastMessageId = page.messages.at(-1)?.id;
  const proposalFeedback = savedProposalId
    ? `Proposal response saved.${
        page.hasEarlier &&
        !page.messages.some((message) => message.id === savedProposalId)
          ? " Use Load earlier messages to view it."
          : ""
      }`
    : "";
  useLayoutEffect(() => {
    if (!focusRequest || focusedRequest.current === focusRequest) return;
    const message = document.getElementById(`message-${focusRequest.id}`);
    const target =
      message ??
      (savedProposalId === focusRequest.id
        ? root.current?.querySelector<HTMLElement>("[data-proposal-feedback]")
        : null);
    if (!target) return;
    focusedRequest.current = focusRequest;
    target.scrollIntoView({ block: message ? "start" : "center" });
    target.focus({ preventScroll: true });
  }, [focusRequest, page.messages, savedProposalId]);
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
        .then(async (result) => {
          // Refresh loaded history too: old proposal cards must never keep stale live actions.
          if (!before && loadedFrom.current) {
            let cursor = result.messages[0]?.position;
            let earlier = result.hasEarlier;
            while (
              earlier &&
              cursor &&
              BigInt(cursor) > BigInt(loadedFrom.current)
            ) {
              const previous = await responsePage(
                await fetch(
                  `${endpoint}?${new URLSearchParams({ search, before: cursor })}`,
                  { cache: "no-store" },
                ),
              );
              result = {
                messages: [...previous.messages, ...result.messages],
                hasEarlier: previous.hasEarlier,
              };
              cursor = previous.messages[0]?.position;
              earlier = previous.hasEarlier;
            }
          }
          if (current !== generation.current) return;
          loadedFrom.current =
            result.messages[0]?.position ?? loadedFrom.current;
          setPage((old) => ({
            messages: mergeMessages(old.messages, result.messages),
            hasEarlier: result.hasEarlier,
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
  const sent = (result: MessagePage, scrollToEnd = true): void => {
    generation.current++;
    setSavedProposalId("");
    setSearch("");
    if (searchInput.current) searchInput.current.value = "";
    setPage(result);
    setLoading(false);
    setError("");
    loadedFrom.current = result.messages[0]?.position;
    if (scrollToEnd)
      requestAnimationFrame(() => {
        if (list.current) list.current.scrollTop = list.current.scrollHeight;
      });
  };
  const proposalAction = async (input: unknown): Promise<MessagePage> => {
    const action = proposalActionSchema.parse(input);
    setSavedProposalId("");
    const result = await responsePage(
      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      }),
    );
    follow.current = false;
    sent(result, false);
    if (!result.messages.some((message) => message.id === action.requestId))
      setSavedProposalId(action.requestId);
    window.dispatchEvent(new Event("yinsen:unread"));
    return result;
  };
  const saved = (requestId: string): void => setFocusRequest({ id: requestId });
  const closeProposal = (requestId?: string): void => {
    setProposing(false);
    if (requestId) saved(requestId);
    else requestAnimationFrame(() => proposeTrigger.current?.focus());
  };
  return (
    <section
      className="card message-thread"
      id="messages"
      ref={root}
      aria-label="Conversation"
    >
      <div className="thread-heading">
        <div>
          <p className="eyebrow">Private conversation</p>
          <h2>
            {conversation.kind === "client"
              ? "General messages"
              : "Project messages"}
          </h2>
        </div>
        {conversation.kind === "client" && (
          <button
            className="secondary"
            ref={proposeTrigger}
            onClick={() => setProposing(true)}
          >
            Propose a project
          </button>
        )}
      </div>
      <form
        role="search"
        className="message-search"
        onSubmit={(event) => {
          event.preventDefault();
          const value = new FormData(event.currentTarget).get("search");
          const next = typeof value === "string" ? value : "";
          setSavedProposalId("");
          setLoading(true);
          setPage({ messages: [], hasEarlier: false });
          loadedFrom.current = undefined;
          if (next === search) void load();
          else setSearch(next);
        }}
      >
        <label>
          Search messages
          <input
            type="search"
            placeholder="Find a message"
            ref={searchInput}
            name="search"
            maxLength={100}
            defaultValue={search}
          />
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
      <p
        className="thread-status"
        role="status"
        data-proposal-feedback
        tabIndex={-1}
      >
        {loading
          ? "Loading messages…"
          : page.messages.length
            ? proposalFeedback
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
          <MessageBubble
            key={message.id}
            message={message}
            actorId={actorId}
            operator={operator}
            submitAction={proposalAction}
            onSaved={saved}
          />
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
      {proposing && (
        <ProposalEditor
          initial={{
            name: "",
            description: "",
            budget: 0,
            currency: defaultCurrency,
            milestones: [],
          }}
          submitAction={async (input) => {
            const result = await proposalAction(input);
            closeProposal(proposalActionSchema.parse(input).requestId);
            return result;
          }}
          onCancel={() => closeProposal()}
        />
      )}
    </section>
  );
}
