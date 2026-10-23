"use client";
import { useEffect, useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { SettingsForm } from "./settings-form";
import { RevokeSession, clientRequest } from "./client-forms";
import type { OperatorIdentity } from "../lib/auth/session";
import type { AccountSession } from "../lib/auth/account";

export function AccountSettings({
  identity,
}: {
  identity: OperatorIdentity;
}): ReactElement {
  return (
    <SettingsForm
      title="Account"
      path="/api/account"
      values={(form) => Object.fromEntries(form)}
      success="Profile saved. Use your saved email for your next sign-in."
    >
      <div className="form-grid">
        <label>
          Your name
          <input
            name="name"
            defaultValue={identity.name}
            required
            maxLength={100}
            autoComplete="name"
          />
        </label>
        <label>
          Account email
          <input
            name="email"
            defaultValue={identity.email}
            type="email"
            required
            maxLength={254}
            autoComplete="username"
          />
        </label>
      </div>
      <label>
        Current password
        <input
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
        />
      </label>
      <p className="field-hint">
        Your private sign-in email is separate from your public business contact
        email.
      </p>
    </SettingsForm>
  );
}

export function PasswordSettings(): ReactElement {
  return (
    <SettingsForm
      title="Password"
      path="/api/account/password"
      method="POST"
      values={(form) => Object.fromEntries(form)}
      success="Password saved. This browser stays signed in; other operator sessions are signed out."
    >
      <label>
        Current password
        <input
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
        />
      </label>
      <div className="form-grid">
        <label>
          New password
          <input
            name="newPassword"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </label>
        <label>
          Confirm new password
          <input
            name="confirmPassword"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </label>
      </div>
      <p className="field-hint">
        Use a unique passphrase of at least 8 characters, up to 72 UTF-8 bytes.
        Saving securely renews this browser and signs out other operator
        sessions.
      </p>
    </SettingsForm>
  );
}

export function OperatorSessionSettings({
  sessions,
}: {
  sessions: AccountSession[];
}): ReactElement {
  const router = useRouter(),
    [pending, setPending] = useState<string | null>(null),
    [error, setError] = useState("");
  async function revoke(session: AccountSession): Promise<void> {
    if (
      !window.confirm(
        session.current
          ? "Sign out this browser?"
          : "Revoke this operator session?",
      )
    )
      return;
    setPending(session.id);
    setError("");
    try {
      await clientRequest(
        "/api/account/sessions",
        "POST",
        { scope: "one", id: session.id },
        z.unknown(),
      );
      if (session.current) router.replace("/login");
      router.refresh();
    } catch (failure: unknown) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to revoke. Please retry.",
      );
    } finally {
      setPending(null);
    }
  }
  return (
    <>
      <ul className="settings-sessions">
        {sessions.map((session) => (
          <li key={session.id}>
            <div>
              <strong>
                {session.current ? "This browser" : "Operator session"}
              </strong>
              <span>
                Started{" "}
                {new Date(session.createdAt)
                  .toISOString()
                  .slice(0, 16)
                  .replace("T", " ")}{" "}
                UTC
              </span>
            </div>
            <button
              type="button"
              className="secondary"
              disabled={pending !== null}
              onClick={() => void revoke(session)}
            >
              {pending === session.id
                ? "Revoking…"
                : session.current
                  ? "Sign out"
                  : "Revoke"}
            </button>
          </li>
        ))}
      </ul>
      <p role="alert">{error}</p>
      <details>
        <summary>Sign out all operator sessions</summary>
        <SettingsForm
          title="Session revocation"
          path="/api/account/sessions"
          method="POST"
          values={(form) => ({
            scope: "all",
            currentPassword: form.get("currentPassword"),
          })}
          signOut
        >
          <p>
            Signs out every operator browser, including this one. Client
            sessions are managed separately below.
          </p>
          <label>
            Current password
            <input
              name="currentPassword"
              type="password"
              required
              autoComplete="current-password"
            />
          </label>
        </SettingsForm>
      </details>
    </>
  );
}

const clientSessionsSchema = z.object({
  data: z.array(
    z.object({ id: z.uuid(), createdAt: z.string(), expiresAt: z.string() }),
  ),
  error: z.object({ message: z.string() }).nullable(),
});
export function ClientSessionSettings({
  clients,
}: {
  clients: { id: string; name: string; email: string }[];
}): ReactElement {
  const [id, setId] = useState(""),
    [retry, setRetry] = useState(0);
  const [state, setState] = useState<{
    status: "idle" | "loading" | "ready" | "error";
    sessions: z.infer<typeof clientSessionsSchema>["data"];
    error: string;
  }>({ status: "idle", sessions: [], error: "" });
  useEffect(() => {
    if (!id) return;
    const abort = new AbortController();
    void (async () => {
      setState({ status: "loading", sessions: [], error: "" });
      try {
        const response = await fetch(`/api/clients/${id}/sessions`, {
          cache: "no-store",
          signal: abort.signal,
        });
        const result = clientSessionsSchema.parse(await response.json());
        if (!response.ok) {
          if (!abort.signal.aborted)
            setState({
              status: "error",
              sessions: [],
              error: result.error?.message ?? "Unable to read sessions.",
            });
          return;
        }
        if (!abort.signal.aborted)
          setState({ status: "ready", sessions: result.data, error: "" });
      } catch {
        if (!abort.signal.aborted)
          setState({
            status: "error",
            sessions: [],
            error: "Unable to read sessions. Please retry.",
          });
      }
    })();
    return () => abort.abort();
  }, [id, retry]);
  return (
    <>
      <label>
        Client
        <select value={id} onChange={(event) => setId(event.target.value)}>
          <option value="">Choose a client</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name} · {client.email}
            </option>
          ))}
        </select>
      </label>
      {id && (
        <>
          <button
            type="button"
            className="secondary"
            onClick={() => setRetry((value) => value + 1)}
          >
            Refresh sessions
          </button>
          {state.status === "loading" && (
            <p role="status">Loading client sessions…</p>
          )}
          {state.status === "error" && (
            <p role="alert">{state.error} Use Refresh sessions to retry.</p>
          )}
          {state.status === "ready" && (
            <>
              <p>
                {state.sessions.length
                  ? "Revoke access for an individual browser. Refresh to read current sessions."
                  : "No active sessions."}
              </p>
              <ul className="settings-sessions">
                {state.sessions.map((session) => (
                  <li key={session.id}>
                    <span>
                      Started{" "}
                      {new Date(session.createdAt)
                        .toISOString()
                        .slice(0, 16)
                        .replace("T", " ")}{" "}
                      UTC
                    </span>
                    <RevokeSession
                      clientId={id}
                      sessionId={session.id}
                      onRevoked={() => setRetry((value) => value + 1)}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      {!clients.length && (
        <p>
          No active clients yet. Create a client before managing their sessions.
        </p>
      )}
    </>
  );
}
