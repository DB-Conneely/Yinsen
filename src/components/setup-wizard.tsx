"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
} from "react";
import { z } from "zod";
import { passwordStrength, setupSchema } from "../lib/auth/validation";
import { submitJson } from "./auth-forms";
import { AppError } from "../lib/errors";

const defaults = {
  brandName: "Portal",
  brandColour: "#2457A7",
  defaultCurrency: "GBP",
  welcomeText: "Welcome to your client portal.",
};
type WizardState = {
  name: string;
  email: string;
  password: string;
  brandName: string;
  brandColour: string;
  defaultCurrency: string;
  welcomeText: string;
};
type FieldsProps = {
  value: WizardState;
  update: (name: keyof WizardState, value: string) => void;
};

function AccountFields({ value, update }: FieldsProps): ReactElement {
  return (
    <fieldset>
      <legend>Your operator account</legend>
      <label htmlFor="name">Your name</label>
      <input
        id="name"
        required
        maxLength={100}
        autoComplete="name"
        value={value.name}
        onChange={(event) => update("name", event.target.value)}
      />
      <label htmlFor="email">Email</label>
      <input
        id="email"
        required
        type="email"
        maxLength={254}
        autoComplete="username"
        value={value.email}
        onChange={(event) => update("email", event.target.value)}
      />
      <label htmlFor="password">Password</label>
      <input
        id="password"
        required
        type="password"
        minLength={8}
        maxLength={72}
        autoComplete="new-password"
        aria-describedby="strength"
        value={value.password}
        onChange={(event) => update("password", event.target.value)}
      />
      <p id="strength" aria-live="polite">
        {passwordStrength(value.password)} Maximum 72 UTF-8 bytes.
      </p>
    </fieldset>
  );
}

function BrandFields({ value, update }: FieldsProps): ReactElement {
  return (
    <fieldset>
      <legend>Make it yours</legend>
      <label htmlFor="brandName">Brand name</label>
      <input
        id="brandName"
        required
        maxLength={100}
        value={value.brandName}
        onChange={(event) => update("brandName", event.target.value)}
      />
      <label htmlFor="brandColour">Brand colour</label>
      <input
        id="brandColour"
        type="color"
        value={value.brandColour}
        onChange={(event) => update("brandColour", event.target.value)}
      />
      <label htmlFor="defaultCurrency">Default currency</label>
      <select
        id="defaultCurrency"
        value={value.defaultCurrency}
        onChange={(event) => update("defaultCurrency", event.target.value)}
      >
        {setupSchema.shape.defaultCurrency.unwrap().options.map((currency) => (
          <option key={currency}>{currency}</option>
        ))}
      </select>
      <label htmlFor="welcomeText">Welcome message</label>
      <textarea
        id="welcomeText"
        required
        maxLength={500}
        value={value.welcomeText}
        onChange={(event) => update("welcomeText", event.target.value)}
      />
      <section
        aria-label="Brand preview"
        className="preview"
        style={{ borderColor: value.brandColour }}
      >
        <h2>{value.brandName}</h2>
        <p>{value.welcomeText}</p>
        <p>Default currency: {value.defaultCurrency}</p>
      </section>
      <button
        type="button"
        className="secondary"
        onClick={() => {
          for (const [name, entry] of Object.entries(defaults)) {
            /* CAST: entries are the fixed branding-default keys above. */ update(
              name as keyof typeof defaults,
              entry,
            );
          }
        }}
      >
        Use defaults
      </button>
    </fieldset>
  );
}

function Integrations({
  status,
  verify,
  pending,
  email,
}: {
  status: string;
  verify: () => void;
  pending: boolean;
  email: string;
}): ReactElement {
  return (
    <section>
      <h2>Your installation</h2>
      <p>
        Infrastructure is configured by the server environment. Credentials are
        never collected here.
      </p>
      <p>
        If email is configured, Verify installation submits a test to Resend’s
        fixed test address, using account quota. Provider acceptance does not
        prove inbox delivery.
      </p>
      <ul className="integration-list">
        <li>
          <strong>Database</strong>
          <span>{status || "Not checked"}</span>
        </li>
        <li>
          <strong>Email</strong>
          <span>{email || "Not checked"}</span>
        </li>
        <li>
          <strong>Payments</strong>
          <span>Skipped · no service configured</span>
        </li>
        <li>
          <strong>File storage</strong>
          <span>Skipped · no files required for setup</span>
        </li>
      </ul>
      <button
        className="secondary"
        type="button"
        disabled={pending}
        onClick={verify}
      >
        {pending ? "Checking…" : "Verify installation"}
      </button>
      <p>
        Optional services can be configured when needed. See{" "}
        <a href="/operator-guide">operator instructions</a>.
      </p>
    </section>
  );
}

function useWizard(): {
  value: WizardState;
  update: FieldsProps["update"];
  step: number;
  error: string;
  pending: boolean;
  status: string;
  email: string;
  submit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  back: () => void;
  verify: () => Promise<void>;
} {
  const [value, setValue] = useState<WizardState>({
    name: "",
    email: "",
    password: "",
    ...defaults,
  });
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [email, setEmail] = useState("");
  async function verify(): Promise<void> {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/setup/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const result = z
        .object({
          data: z
            .object({
              database: z.literal("configured"),
              email: z.enum(["accepted", "skipped", "failed"]),
            })
            .nullable(),
        })
        .parse(await response.json());
      if (!response.ok || !result.data)
        throw new AppError(
          503,
          "VERIFY_FAILED",
          "Verification failed. Check the database and operator instructions.",
        );
      setEmail(
        result.data.email === "accepted"
          ? "Configured · provider accepted test (inbox delivery unverified)"
          : result.data.email === "skipped"
            ? "Skipped · manual login links available"
            : "Failed · check Resend key and sender",
      );
      if (result.data.email === "failed")
        throw new AppError(
          503,
          "VERIFY_FAILED",
          "Email verification failed. Check Resend configuration in the operator instructions.",
        );
      setStatus("Configured · connection verified");
    } catch (failure: unknown) {
      setStatus("Failed");
      setError(
        failure instanceof Error ? failure.message : "Verification failed.",
      );
    } finally {
      setPending(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError("");
    if (step === 1) {
      const result = setupSchema
        .pick({ name: true, email: true, password: true })
        .safeParse({
          name: value.name,
          email: value.email,
          password: value.password,
        });
      if (!result.success) {
        setError(result.error.issues.map((issue) => issue.message).join(" "));
        return;
      }
    }
    if (step === 2 && !status.startsWith("Configured")) {
      setError("Verify the installation before continuing.");
      return;
    }
    if (step < 3) {
      setStep(step + 1);
      return;
    }
    setPending(true);
    try {
      await submitJson("/api/setup", value);
      setValue((current) => ({ ...current, password: "" }));
      setStep(4);
    } catch (failure: unknown) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Setup failed. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }
  return {
    value,
    update: (name, entry) =>
      setValue((current) => ({ ...current, [name]: entry })),
    step,
    error,
    pending,
    status,
    email,
    submit,
    back: () => {
      setStep(step - 1);
      setError("");
    },
    verify,
  };
}

export function SetupWizard(): ReactElement {
  const wizard = useWizard();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [wizard.step]);
  return (
    <main className="card setup">
      <p className="eyebrow">First boot · Step {wizard.step} of 4</p>
      <h1 tabIndex={-1} ref={heading}>
        Set up your portal
      </h1>
      <ol className="steps" aria-label="Setup progress">
        {["Account", "Integrations", "Branding", "Complete"].map(
          (name, index) => (
            <li
              key={name}
              aria-current={wizard.step === index + 1 ? "step" : undefined}
            >
              {name}
            </li>
          ),
        )}
      </ol>
      {wizard.step === 4 ? (
        <section>
          <h2>{wizard.value.brandName} is ready</h2>
          <p>
            Your operator account and {wizard.value.defaultCurrency} defaults
            are saved. Database verified. Email: {wizard.email}.
          </p>
          <a href="/dashboard" className="button">
            Go to dashboard
          </a>
        </section>
      ) : (
        <form
          onSubmit={(event) => {
            void wizard.submit(event);
          }}
          aria-busy={wizard.pending}
        >
          {wizard.step === 1 && (
            <AccountFields value={wizard.value} update={wizard.update} />
          )}
          {wizard.step === 2 && (
            <Integrations
              status={wizard.status}
              email={wizard.email}
              pending={wizard.pending}
              verify={() => {
                void wizard.verify();
              }}
            />
          )}
          {wizard.step === 3 && (
            <BrandFields value={wizard.value} update={wizard.update} />
          )}
          <p role="alert">{wizard.error}</p>
          <div className="actions">
            {wizard.step > 1 && (
              <button
                type="button"
                className="secondary"
                onClick={wizard.back}
                disabled={wizard.pending}
              >
                Back
              </button>
            )}
            <button type="submit" disabled={wizard.pending}>
              {wizard.pending
                ? "Working…"
                : wizard.step === 3
                  ? "Create portal"
                  : "Continue"}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
