"use client";

import { useState, type FormEvent, type ReactElement } from "react";
import { z } from "zod";
import { AppError } from "../lib/errors";
import { useRouter } from "next/navigation";

const resultSchema = z.object({
  error: z.object({ message: z.string() }).nullable(),
});

export async function submitJson(path: string, body: unknown): Promise<void> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = resultSchema.parse(await response.json());
  if (!response.ok)
    throw new AppError(
      response.status,
      "REQUEST_FAILED",
      result.error?.message ?? "Request failed. Please try again.",
    );
}

export function LoginForm(): ReactElement {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      await submitJson("/api/auth/login", {
        email: data.get("email"),
        password: data.get("password"),
      });
      router.replace("/dashboard");
      router.refresh();
    } catch (failure: unknown) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to log in. Please try again.",
      );
      setPending(false);
    }
  }
  return (
    <form
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <label htmlFor="email">Email</label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="username"
        required
        maxLength={254}
      />
      <label htmlFor="password">Password</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      <p role="alert">{error}</p>
      <button type="submit" disabled={pending}>
        {pending ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}

export function LogoutButton({
  destination = "/login",
}: {
  destination?: string;
}): ReactElement {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function logout(): Promise<void> {
    setPending(true);
    setError("");
    try {
      await submitJson("/api/auth/logout", {});
      router.replace(destination);
      router.refresh();
    } catch (failure: unknown) {
      setError(
        failure instanceof Error ? failure.message : "Unable to log out.",
      );
      setPending(false);
    }
  }
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          void logout();
        }}
        disabled={pending}
      >
        {pending ? "Logging out…" : "Log out"}
      </button>
      <p role="alert">{error}</p>
    </div>
  );
}
