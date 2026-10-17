"use client";
import { useRef, useState, type FormEvent, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import type { Deliverable } from "../lib/deliverables/queries";
import { clientRequest } from "./client-forms";

function size(bytes: number): string {
  return bytes < 1024
    ? `${bytes} B`
    : bytes < 1048576
      ? `${Math.ceil(bytes / 1024)} KB`
      : `${(bytes / 1048576).toFixed(1)} MB`;
}

function FileVersion({
  file,
  operator,
}: {
  file: Deliverable;
  operator: boolean;
}): ReactElement {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function release(): Promise<void> {
    setPending(true);
    setError("");
    try {
      await clientRequest(
        `/api/deliverables/${file.id}`,
        "PATCH",
        { released: !file.released },
        z.unknown(),
      );
      router.refresh();
    } catch (failure: unknown) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to change release. Please retry.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="file-version">
      <div className="file-version-info">
        <strong>{file.filename}</strong>
        <span>
          Version {file.version} · {size(file.size)} ·{" "}
          <time dateTime={file.uploadedAt}>
            {new Date(file.uploadedAt).toLocaleDateString("en-GB", {
              timeZone: "UTC",
            })}
          </time>
        </span>
        <span className="file-release" data-released={file.released}>
          {file.released ? "Released to clients" : "Pending release"}
        </span>
      </div>
      <div className="actions file-actions">
        {(operator || file.released) && (
          <a
            className="button secondary"
            href={`/api/deliverables/${file.id}/download`}
          >
            Download{" "}
            <span className="sr-only">
              {file.filename}, version {file.version}
            </span>
          </a>
        )}
        {operator && (
          <button
            className="secondary"
            disabled={pending}
            onClick={() => {
              void release();
            }}
          >
            {pending ? "Saving…" : file.released ? "Relock" : "Release"}
            <span className="sr-only">
              {" "}
              {file.filename}, version {file.version}
            </span>
          </button>
        )}
      </div>
      {error && (
        <p className="file-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function UploadForm({
  milestoneId,
  milestoneName,
  roots,
  maxBytes,
}: {
  milestoneId: string;
  milestoneName: string;
  roots: Deliverable[];
  maxBytes: number;
}): ReactElement {
  const router = useRouter();
  const requestId = useRef<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  async function upload(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || !file.size || file.size > maxBytes) {
      setError(`Choose a non-empty file up to ${size(maxBytes)}.`);
      return;
    }
    requestId.current ??= crypto.randomUUID();
    data.set("requestId", requestId.current);
    if (!data.get("parentDeliverableId")) data.delete("parentDeliverableId");
    setPending(true);
    setError("");
    setSaved("");
    try {
      const response = await fetch(
        `/api/milestones/${milestoneId}/deliverables`,
        { method: "POST", body: data },
      );
      const payload: unknown = await response.json();
      if (!response.ok) {
        const failure = z
          .object({ error: z.object({ message: z.string() }) })
          .safeParse(payload);
        throw new TypeError(
          failure.success
            ? failure.data.error.message
            : "Upload failed. Keep this file selected and retry.",
        );
      }
      const result = z
        .object({
          data: z.object({ filename: z.string(), version: z.number() }),
        })
        .parse(payload);
      setSaved(
        `${result.data.filename} · version ${result.data.version} saved. Pending release.`,
      );
      form.reset();
      requestId.current = null;
      router.refresh();
    } catch (failure: unknown) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Upload failed. Your selected file is retained for retry.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <details className="deliverable-upload">
      <summary>Upload a deliverable</summary>
      <form
        aria-label={`Upload to ${milestoneName}`}
        aria-busy={pending}
        onSubmit={(event) => {
          void upload(event);
        }}
        onChange={() => {
          requestId.current = null;
          setSaved("");
        }}
      >
        <fieldset disabled={pending}>
          <label>
            Version of
            <select name="parentDeliverableId">
              <option value="">New deliverable</option>
              {roots.map((root) => (
                <option key={root.id} value={root.id}>
                  {root.filename}
                </option>
              ))}
            </select>
          </label>
          <label>
            File
            <input
              type="file"
              name="file"
              required
              accept=".txt,.md,.csv,.pdf,.png,.jpg,.jpeg,.webp,.gif,.zip,.docx,.xlsx,.pptx"
            />
          </label>
          <p className="field-help">
            Documents, text, images or ZIP · up to {size(maxBytes)}. Every new
            version starts locked.
          </p>
          <button type="submit">
            {pending ? "Uploading…" : "Upload file"}
          </button>
        </fieldset>
        {error && (
          <p role="alert">
            {error} Your file selection is kept; retry this upload.
          </p>
        )}
        <p role="status">{saved}</p>
      </form>
    </details>
  );
}

export function MilestoneFiles({
  milestoneId,
  milestoneName,
  files,
  operator,
  maxBytes,
}: {
  milestoneId: string;
  milestoneName: string;
  files: Deliverable[];
  operator: boolean;
  maxBytes: number;
}): ReactElement {
  const roots = files.filter((file) => !file.parentDeliverableId);
  return (
    <section
      className="milestone-files"
      aria-label={`${milestoneName} deliverables`}
    >
      <h4>
        Deliverables <span>{roots.length}</span>
      </h4>
      {roots.length ? (
        <ul className="deliverable-list">
          {roots.map((root) => {
            const versions = files
              .filter(
                (file) =>
                  file.id === root.id || file.parentDeliverableId === root.id,
              )
              .sort((a, b) => b.version - a.version);
            const latest = versions[0] ?? root;
            return (
              <li key={root.id}>
                <FileVersion file={latest} operator={operator} />
                {versions.length > 1 && (
                  <details className="file-history">
                    <summary>Previous versions ({versions.length - 1})</summary>
                    {versions.slice(1).map((file) => (
                      <FileVersion
                        key={file.id}
                        file={file}
                        operator={operator}
                      />
                    ))}
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="field-help">No deliverables uploaded yet.</p>
      )}
      {operator && (
        <UploadForm
          milestoneId={milestoneId}
          milestoneName={milestoneName}
          roots={roots}
          maxBytes={maxBytes}
        />
      )}
    </section>
  );
}
