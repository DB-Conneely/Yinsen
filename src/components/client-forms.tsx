"use client";
import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import type { Client } from "../lib/clients/service";
import { AppError } from "../lib/errors";

export async function clientRequest<T>(
  path: string,
  method: string,
  body: unknown,
  schema: z.ZodType<T>,
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = z
    .object({
      data: z.unknown(),
      error: z.object({ message: z.string() }).nullable(),
    })
    .parse(await response.json());
  if (!response.ok)
    throw new AppError(
      response.status,
      "REQUEST_FAILED",
      result.error?.message ?? "Request failed. Please try again.",
    );
  return schema.parse(result.data);
}

function MetadataFields({
  fields,
  setFields,
}: {
  fields: [string, string][];
  setFields: (value: [string, string][]) => void;
}): ReactElement {
  return (
    <fieldset>
      <legend>Custom fields</legend>
      {fields.map(([key, value], index) => (
        <div key={index} className="metadata-row">
          <label>
            Field {index + 1} name
            <input
              value={key}
              required
              maxLength={50}
              onChange={(event) =>
                setFields(
                  fields.map((pair, i) =>
                    i === index ? [event.target.value, pair[1]] : pair,
                  ),
                )
              }
            />
          </label>
          <label>
            Field {index + 1} value
            <input
              value={value}
              maxLength={500}
              onChange={(event) =>
                setFields(
                  fields.map((pair, i) =>
                    i === index ? [pair[0], event.target.value] : pair,
                  ),
                )
              }
            />
          </label>
          <button
            type="button"
            className="secondary"
            aria-label={`Remove field ${index + 1}`}
            onClick={() => setFields(fields.filter((_, i) => i !== index))}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="secondary"
        disabled={fields.length >= 20}
        onClick={() => setFields([...fields, ["", ""]])}
      >
        Add field
      </button>
    </fieldset>
  );
}

export function ClientForm({ client }: { client?: Client }): ReactElement {
  const router = useRouter();
  const [fields, setFields] = useState<[string, string][]>(
    Object.entries(client?.metadata ?? {}),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (new Set(fields.map(([key]) => key.trim())).size !== fields.length)
        throw new AppError(
          400,
          "DUPLICATE_FIELD",
          "Custom field names must be unique.",
        );
      const saved = await clientRequest(
        `/api/clients${client ? `/${client.id}` : ""}`,
        client ? "PATCH" : "POST",
        { ...values, metadata: Object.fromEntries(fields) },
        z.object({ id: z.uuid() }),
      );
      router.push(`/dashboard/clients/${saved.id}`);
      router.refresh();
    } catch (failure: unknown) {
      setError(
        failure instanceof Error ? failure.message : "Unable to save client.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <form
      className="card client-form"
      aria-busy={pending}
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <label htmlFor="client-name">Name</label>
      <input
        id="client-name"
        name="name"
        defaultValue={client?.name}
        required
        maxLength={255}
      />
      <label htmlFor="client-email">Email</label>
      <input
        id="client-email"
        name="email"
        type="email"
        defaultValue={client?.email}
        required
        maxLength={254}
      />
      <label htmlFor="client-company">Company</label>
      <input
        id="client-company"
        name="company"
        defaultValue={client?.company}
        maxLength={255}
      />
      <label htmlFor="client-phone">Phone</label>
      <input
        id="client-phone"
        name="phone"
        type="tel"
        defaultValue={client?.phone}
        maxLength={50}
      />
      <label htmlFor="client-notes">Private notes</label>
      <textarea
        id="client-notes"
        name="notes"
        defaultValue={client?.notes}
        maxLength={3000}
      />
      <MetadataFields fields={fields} setFields={setFields} />
      <p role="alert">{error}</p>
      <button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save client"}
      </button>
    </form>
  );
}

export function ClientActions({
  id,
  archived,
}: {
  id: string;
  archived: boolean;
}): ReactElement {
  const router = useRouter();
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const archive = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirm && !pending) cancel.current?.focus();
  }, [confirm, pending]);
  function cancelArchive(): void {
    setConfirm(false);
    archive.current?.focus();
  }
  async function action(kind: "archive" | "restore" | "link"): Promise<void> {
    setPending(true);
    setError("");
    setUrl("");
    setCopied(false);
    try {
      const path = `/api/clients/${id}${kind === "archive" ? "" : kind === "restore" ? "/restore" : "/generate-link"}`;
      const result = await clientRequest(
        path,
        kind === "archive" ? "DELETE" : "POST",
        {},
        z.object({ url: z.string().optional() }),
      );
      if (result.url) setUrl(result.url);
      setConfirm(false);
      router.refresh();
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : "Request failed.");
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="client-actions" aria-label="Client actions">
      <div className="actions">
        {archived ? (
          <button
            disabled={pending}
            onClick={() => {
              void action("restore");
            }}
          >
            Restore client
          </button>
        ) : (
          <>
            <a
              className="button secondary"
              href={`/dashboard/clients/${id}/edit`}
            >
              Edit client
            </a>
            <button
              disabled={pending}
              onClick={() => {
                void action("link");
              }}
            >
              Generate login link
            </button>
            <button
              ref={archive}
              disabled={pending}
              className="secondary archive-client"
              onClick={() => setConfirm(true)}
            >
              Archive client
            </button>
          </>
        )}
      </div>
      {confirm && (
        <div
          className="confirmation"
          role="group"
          aria-label="Archive client confirmation"
          onKeyDown={(event) => {
            if (event.key === "Escape" && !pending) cancelArchive();
          }}
        >
          <p>
            Archive this client? All sessions and pending login links will be
            revoked immediately. Historical information is preserved.
          </p>
          <button
            disabled={pending}
            onClick={() => {
              void action("archive");
            }}
          >
            Confirm archive
          </button>{" "}
          <button
            ref={cancel}
            disabled={pending}
            className="secondary"
            onClick={cancelArchive}
          >
            Cancel
          </button>
        </div>
      )}
      {url && (
        <div className="login-link-result">
          <label htmlFor="login-link">
            Single-use login link · expires in 24 hours
          </label>
          <input id="login-link" readOnly value={url} />
          <button
            onClick={() => {
              void navigator.clipboard
                .writeText(url)
                .then(() => setCopied(true))
                .catch(() =>
                  setError("Copy unavailable. Select and copy the link above."),
                );
            }}
          >
            Copy link
          </button>
          <p role="status">
            {copied ? "Link copied" : "Share privately with this client."}
          </p>
        </div>
      )}
      <p role="alert">{error}</p>
    </section>
  );
}

export function RevokeSession({
  clientId,
  sessionId,
}: {
  clientId: string;
  sessionId: string;
}): ReactElement {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function revoke(): Promise<void> {
    setPending(true);
    try {
      await clientRequest(
        `/api/clients/${clientId}/sessions`,
        "POST",
        { sessionId },
        z.object({ revoked: z.literal(true) }),
      );
      router.refresh();
    } catch (failure: unknown) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to revoke session.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <button
        disabled={pending}
        onClick={() => {
          void revoke();
        }}
      >
        Revoke session
      </button>
      <p role="alert">{error}</p>
    </>
  );
}
