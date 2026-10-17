"use client";
import { useState, type FormEvent, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { submitJson } from "./auth-forms";

export function ClientLoginForm(): ReactElement {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const email = new FormData(event.currentTarget).get("email");
    setPending(true);
    setError("");
    setMessage("");
    try {
      await submitJson("/api/auth/magic-link", { email });
      setMessage(
        "If this email belongs to an active client, a link has been requested. Check your inbox or contact the operator.",
      );
    } catch (failure: unknown) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to request a login link.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <form
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <label htmlFor="client-login-email">Email</label>
      <input
        id="client-login-email"
        name="email"
        type="email"
        autoComplete="email"
        required
        maxLength={254}
      />
      <button disabled={pending}>
        {pending ? "Requesting…" : "Email me a login link"}
      </button>
      <p role="status">{message}</p>
      <p role="alert">{error}</p>
    </form>
  );
}

export function VerifyClientLink(): ReactElement {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function verify(): Promise<void> {
    setPending(true);
    setError("");
    const token = window.location.hash.slice(1);
    try {
      await submitJson("/api/auth/verify", { token });
      window.history.replaceState(null, "", "/portal/verify");
      router.replace("/portal");
      router.refresh();
    } catch (failure: unknown) {
      setError(
        failure instanceof Error ? failure.message : "Unable to sign in.",
      );
      setPending(false);
    }
  }
  return (
    <>
      <p>
        This private link signs you in to your client account. Continue only if
        you requested it or received it from your operator.
      </p>
      <button
        disabled={pending}
        onClick={() => {
          void verify();
        }}
      >
        {pending ? "Signing in…" : "Continue to portal"}
      </button>
      <p role="alert">{error}</p>
      <a href="/portal/login">Request another link</a>
    </>
  );
}
