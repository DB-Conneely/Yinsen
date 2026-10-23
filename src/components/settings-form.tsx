"use client";
import {
  useState,
  type ReactElement,
  type ReactNode,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { clientRequest } from "./client-forms";

export function SettingsForm({
  title,
  path = "/api/settings",
  method = "PATCH",
  values,
  children,
  success = "Saved. Changes apply on the next page load.",
  signOut = false,
  dirty,
}: {
  title: string;
  path?: string;
  method?: string;
  values: (form: FormData) => unknown;
  children?: ReactNode;
  success?: string;
  signOut?: boolean;
  dirty?: boolean;
}): ReactElement {
  const router = useRouter();
  const [state, setState] = useState<{
    status: "idle" | "pending" | "saved" | "error";
    message: string;
  }>({ status: "idle", message: "" });
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget,
      data = new FormData(form);
    setState({ status: "pending", message: "Saving…" });
    try {
      await clientRequest(path, method, values(data), z.unknown());
      setState({ status: "saved", message: success });
      if (signOut) {
        router.replace("/login?security=changed");
        router.refresh();
      } else {
        form
          .querySelectorAll<HTMLInputElement>('input[type="password"]')
          .forEach((input) => {
            input.value = "";
          });
        router.refresh();
      }
    } catch (failure: unknown) {
      setState({
        status: "error",
        message:
          failure instanceof Error
            ? failure.message
            : "Unable to save. Please retry.",
      });
    }
  }
  return (
    <form
      onSubmit={(event) => void submit(event)}
      aria-label={title}
      onChange={() => {
        if (state.status !== "pending")
          setState({ status: "idle", message: "Unsaved changes." });
      }}
    >
      <fieldset disabled={state.status === "pending"}>
        {children}
        <div className="settings-save">
          <button type="submit">
            <span className="button-label-reserve" aria-hidden="true">
              Save {title.toLowerCase()}
            </span>
            <span className="button-label-current">
              {state.status === "pending"
                ? "Saving…"
                : state.status === "error"
                  ? `Retry ${title.toLowerCase()}`
                  : `Save ${title.toLowerCase()}`}
            </span>
          </button>
          <p role={state.status === "error" ? "alert" : "status"}>
            {state.status === "idle" && dirty === false
              ? "Matches saved settings."
              : state.message}
          </p>
        </div>
      </fieldset>
    </form>
  );
}
