import { randomUUID } from "node:crypto";
import { createServer, connect, type Socket } from "node:net";
import { once } from "node:events";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
import { z } from "zod";
import { getSql } from "../src/lib/db/client";
import { completeSetup, isSetupComplete } from "../src/lib/setup/service";
import { loginOperator } from "../src/lib/auth/login";
import { saveClient } from "../src/lib/clients/service";
import { saveProject, deleteProject } from "../src/lib/projects/service";
import { createMilestone } from "../src/lib/milestones/service";
import {
  createInvoice,
  sendInvoice,
  cancelInvoice,
  settleInvoice,
} from "../src/lib/invoices/service";
import { getInvoice } from "../src/lib/invoices/queries";
import {
  payInvoice,
  invoiceAttempts,
  matchesAttempt,
  reconcileCheckout,
} from "../src/lib/stripe/checkout";
import {
  paymentExceptions,
  resolvePaymentException,
  checkoutProblems,
} from "../src/lib/stripe/queries";
import { handleStripeWebhook } from "../src/lib/stripe/webhook";
import * as provider from "../src/lib/stripe/provider";
import type { ProjectActor } from "../src/lib/projects/access";
import {
  uploadDeliverable,
  releaseDeliverable,
} from "../src/lib/deliverables/service";
import { readDeliverableUpload } from "../src/lib/storage/upload";
import { currencyDigits } from "../src/lib/money";
import { getBranding } from "../src/lib/settings";
import { POST as webhookPost } from "../src/app/api/webhooks/stripe/route";

vi.mock("stripe", async (original) => {
  const sdkModule = await original<typeof import("stripe")>();
  return {
    ...sdkModule,
    default: class extends sdkModule.default {
      constructor(...args: ConstructorParameters<typeof sdkModule.default>) {
        const [key, config] = args;
        super(key, {
          ...config,
          maxNetworkRetries: 0,
          httpClient: sdkModule.default.createFetchHttpClient((...request) =>
            fakeFetch(...request),
          ),
        });
      }
    },
  };
});

let actor: { id: string; role: "operator" },
  client: ProjectActor,
  outsider: ProjectActor;
let projectId: string, milestoneId: string, fileId: string;
const sessions = new Map<string, Record<string, unknown>>();
const keys = new Map<string, string>();
let failCreate = false,
  failExpire = false,
  rejectNextCreate = false;
let creates = 0;
const signing = "whsec_fixture";
const actualStripeClient = provider.stripeClient;
let sdk: Stripe;
const fakeFetch: typeof fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url,
  );
  if (url.pathname === "/v1/account")
    return Response.json({ id: "acct_fixture", object: "account" });
  if (url.pathname === "/v1/checkout/sessions") {
    if (rejectNextCreate) {
      rejectNextCreate = false;
      return Response.json(
        {
          error: {
            type: "invalid_request_error",
            message: "Configuration unavailable",
          },
        },
        { status: 400 },
      );
    }
    const key = new Headers(init?.headers).get("idempotency-key") ?? "";
    const existing = keys.get(key);
    if (existing) return Response.json(sessions.get(existing));
    const params = new URLSearchParams(await new Response(init?.body).text());
    const id = `cs_test_${randomUUID().replaceAll("-", "")}`;
    const session = {
      id,
      object: "checkout.session",
      mode: "payment",
      livemode: false,
      status: "open",
      payment_status: "unpaid",
      payment_intent: null,
      amount_total: Number(
        params.get("line_items[0][price_data][unit_amount]"),
      ),
      currency: params.get("line_items[0][price_data][currency]"),
      client_reference_id: params.get("client_reference_id"),
      metadata: {
        attempt_id: params.get("metadata[attempt_id]"),
        invoice_id: params.get("metadata[invoice_id]"),
        fingerprint: params.get("metadata[fingerprint]"),
      },
      url: `https://checkout.stripe.com/c/pay/${id}`,
    };
    sessions.set(id, session);
    keys.set(key, id);
    creates++;
    if (failCreate)
      throw new TypeError("External response lost after provider create");
    return Response.json(session);
  }
  const id = url.pathname.split("/")[4] ?? "";
  const session = sessions.get(id);
  if (!session)
    return Response.json(
      { error: { type: "invalid_request_error", message: "No session" } },
      { status: 404 },
    );
  if (url.pathname.endsWith("/expire")) {
    if (failExpire)
      return Response.json(
        { error: { type: "api_error", message: "Unavailable" } },
        { status: 503 },
      );
    session.status = "expired";
  }
  return Response.json(session);
};

async function invoice(currency = "GBP", links = true): Promise<string> {
  const draft = await createInvoice(
    {
      requestId: randomUUID(),
      clientId: client.id,
      projectId: links ? projectId : null,
      currency,
      lineItems: [
        { description: "Frozen design", quantity: "1.25", unitPrice: 10001 },
      ],
      totalOverride: 12000,
      milestoneIds: links ? [milestoneId] : [],
    },
    actor,
  );
  return (
    await sendInvoice(draft.id, { expectedRevision: draft.revision }, actor)
  ).id;
}
async function sessionFor(id: string): Promise<Stripe.Checkout.Session> {
  await payInvoice(id, client);
  const attempt = (await invoiceAttempts(getSql(), id))[0];
  expect(attempt?.sessionId).toBeTruthy();
  return provider
    .stripeClient()
    .checkout.sessions.retrieve(attempt?.sessionId ?? "");
}
async function deliver(
  session: Stripe.Checkout.Session,
  type = "checkout.session.completed",
  eventId = `evt_${randomUUID()}`,
): Promise<void> {
  const raw = JSON.stringify({
    id: eventId,
    object: "event",
    type,
    api_version: "2026-09-30.endive",
    livemode: false,
    data: { object: session },
  });
  const signature = provider
    .stripeClient()
    .webhooks.generateTestHeaderString({ payload: raw, secret: signing });
  await handleStripeWebhook(raw, signature);
}
function paid(session: Stripe.Checkout.Session): Stripe.Checkout.Session {
  return {
    ...session,
    status: "complete",
    payment_status: "paid",
    payment_intent: `pi_${randomUUID().replaceAll("-", "")}`,
  };
}

type ReservationHold = {
  sockets: Set<Socket>;
  armed: boolean;
  observed: () => void;
  release: () => void;
};
function postgresFrames(
  input: Buffer,
  consume: (frame: Buffer) => void,
): Buffer {
  let pending = input;
  while (pending.length >= 5) {
    const length = pending.readInt32BE(1) + 1;
    if (length < 5 || length > 20000000 || pending.length < length) break;
    consume(pending.subarray(0, length));
    pending = pending.subarray(length);
  }
  return pending;
}
function closeRelay(clientSocket: Socket, upstream: Socket): void {
  const close = (): void => {
    clientSocket.destroy();
    upstream.destroy();
  };
  clientSocket.on("error", close);
  upstream.on("error", close);
  clientSocket.on("close", close);
  upstream.on("close", close);
}
function relayReservation(clientSocket: Socket, hold: ReservationHold): void {
  const target = new URL(process.env.DATABASE_URL ?? "invalid");
  const upstream = connect(Number(target.port), target.hostname);
  clientSocket.setNoDelay(true);
  upstream.setNoDelay(true);
  hold.sockets.add(clientSocket).add(upstream);
  let pending: Buffer = Buffer.alloc(0);
  let wire = "",
    blocked = false;
  const replies: Buffer[] = [];
  clientSocket.on("data", (chunk: Buffer) => {
    wire = (wire + chunk.toString("utf8")).slice(-32768);
    upstream.write(chunk);
  });
  upstream.on("data", (chunk: Buffer) => {
    pending = postgresFrames(Buffer.concat([pending, chunk]), (frame) => {
      if (
        hold.armed &&
        wire.includes("insert into checkout_attempts") &&
        frame[0] === 67 &&
        frame.subarray(5).toString() === "COMMIT\0"
      ) {
        hold.armed = false;
        blocked = true;
        hold.release = (): void => {
          blocked = false;
          for (const reply of replies.splice(0)) clientSocket.write(reply);
        };
        hold.observed();
      }
      if (blocked) replies.push(Buffer.from(frame));
      else clientSocket.write(frame);
    });
  });
  closeRelay(clientSocket, upstream);
}
async function holdCheckoutReservation(): Promise<{
  url: string;
  observed: Promise<void>;
  release: () => void;
  close: () => Promise<void>;
}> {
  let observed = (): void => undefined;
  const signal = new Promise<void>((resolve) => {
    observed = resolve;
  });
  const hold: ReservationHold = {
    sockets: new Set(),
    armed: true,
    observed,
    release: () => undefined,
  };
  const server = createServer((socket) => relayReservation(socket, hold));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new TypeError("Expected loopback TCP listener");
  const target = new URL(process.env.DATABASE_URL ?? "invalid");
  target.hostname = "127.0.0.1";
  target.port = String(address.port);
  return {
    url: target.toString(),
    observed: signal,
    release: () => hold.release(),
    close: async () => {
      for (const socket of hold.sockets) socket.destroy();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
beforeAll(async () => {
  if (!(await isSetupComplete()))
    await completeSetup({
      name: "Remote Operator",
      email: "operator@example.test",
      password: "remote-proof-password-12!",
      brandName: "Remote Studio",
      brandColour: "#315e9e",
      defaultCurrency: "EUR",
      welcomeText: "A private place for our work together.",
    });
  actor = (
    await loginOperator({
      email: "operator@example.test",
      password: "remote-proof-password-12!",
    })
  ).user;
  await getBranding();
  client = {
    ...(await saveClient(
      { name: "Stripe recipient", email: `${randomUUID()}@example.test` },
      actor,
    )),
    role: "client",
  };
  outsider = {
    ...(await saveClient(
      { name: "Stripe outsider", email: `${randomUUID()}@example.test` },
      actor,
    )),
    role: "client",
  };
  projectId = (
    await saveProject(
      {
        name: "Payment release",
        currency: "GBP",
        clientIds: [client.id, outsider.id],
      },
      actor,
    )
  ).id;
  milestoneId =
    (await createMilestone(projectId, { name: "Design" }, actor)).milestones[0]
      ?.id ?? "";
  const form = new FormData();
  form.set("requestId", randomUUID());
  form.set(
    "file",
    new Blob(["Paid private bytes\n"], { type: "text/plain" }),
    "paid.txt",
  );
  fileId = (
    await uploadDeliverable(
      milestoneId,
      await readDeliverableUpload(
        new Request(`${process.env.APP_ORIGIN}/upload`, {
          method: "POST",
          headers: { origin: process.env.APP_ORIGIN ?? "" },
          body: form,
        }),
      ),
      actor,
    )
  ).id;
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fixture");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", signing);
  sdk = new Stripe("sk_test_fixture", {
    apiVersion: "2026-09-30.endive",
    maxNetworkRetries: 0,
    httpClient: Stripe.createFetchHttpClient(fakeFetch),
  });
  vi.spyOn(provider, "stripeClient").mockReturnValue(sdk);
});
afterAll(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await getSql().end();
  globalThis.yinsenSql = undefined;
});

describe("direct Stripe invoice ownership", () => {
  it("converts charge compatibility units and rejects unsupported precision/amounts", () => {
    expect(currencyDigits("JPY")).toBe(0);
    expect(provider.stripeAmount(500, "GBP")).toBe(500);
    expect(provider.stripeAmount(500, "JPY")).toBe(500);
    expect(provider.stripeAmount(5, "ISK")).toBe(500);
    expect(provider.stripeAmount(5, "UGX")).toBe(500);
    expect(() => provider.stripeAmount(500, "KWD")).toThrow();
    expect(() => provider.stripeAmount(100000000, "GBP")).toThrow();
  });
  it("verifies configured accounts and skips absent Stripe", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    expect(await provider.verifyStripe()).toBe("skipped");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fixture");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", signing);
  });
  it("serializes competing Pay, preserves frozen override and reuses overdue session", async () => {
    const id = await invoice();
    const before = creates;
    const results = await Promise.all([
      payInvoice(id, client),
      payInvoice(id, client),
    ]);
    expect(results[0]?.url).toBe(results[1]?.url);
    expect(creates - before).toBe(1);
    const attempt = (await invoiceAttempts(getSql(), id))[0];
    expect(attempt?.amount).toBe(12000);
    expect(attempt?.providerAmount).toBe(12000);
    await getSql()`update invoices set status='overdue' where id=${id}`;
    expect((await payInvoice(id, client)).url).toBe(results[0]?.url);
    await expect(payInvoice(id, outsider)).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(payInvoice(id, actor)).rejects.toMatchObject({
      statusCode: 403,
    });
  });
  it("recovers provider uncertainty using one durable key and blocks aged unresolved creates", async () => {
    const id = await invoice();
    const before = creates;
    failCreate = true;
    await expect(payInvoice(id, client)).rejects.toMatchObject({
      code: "CHECKOUT_PENDING",
    });
    failCreate = false;
    const attempt = (await invoiceAttempts(getSql(), id))[0];
    expect(attempt?.sessionId).toBeNull();
    await payInvoice(id, client);
    expect(creates - before).toBe(1);
    const aged = await invoice();
    failCreate = true;
    await expect(payInvoice(aged, client)).rejects.toThrow();
    failCreate = false;
    await getSql()`update checkout_attempts set created_at=now()-interval '24 hours' where invoice_id=${aged}`;
    const agedBefore = creates;
    await expect(payInvoice(aged, client)).rejects.toMatchObject({
      code: "CHECKOUT_PENDING",
    });
    expect(creates).toBe(agedBefore);
    const saved = (await invoiceAttempts(getSql(), aged))[0];
    const matching = [...sessions.values()].find(
      (value) =>
        z
          .object({ metadata: z.object({ attempt_id: z.string() }) })
          .parse(value).metadata.attempt_id === saved?.id,
    );
    await reconcileCheckout(
      aged,
      { attemptId: saved?.id, sessionId: matching?.id },
      actor,
    );
    await payInvoice(aged, client);
    expect(creates).toBe(agedBefore);
  });
  it("does not recreate a closed reservation after a competing Pay replaced it", async () => {
    const id = await invoice("GBP", false);
    const original = getSql();
    const transport = await holdCheckoutReservation();
    const proxied = postgres(transport.url, {
      ssl: false,
      max: 5,
      connect_timeout: 5,
      connection: { statement_timeout: 5000 },
      onnotice: () => undefined,
    });
    globalThis.yinsenSql = proxied;
    const delayed = payInvoice(id, client).then(
      (value) => ({ value, error: null }),
      (error: unknown) => ({ value: null, error }),
    );
    try {
      await Promise.race([
        transport.observed,
        once(AbortSignal.timeout(5000), "abort").then(() => {
          throw new TypeError("Reservation COMMIT was not observed");
        }),
      ]);
      expect((await invoiceAttempts(original, id))[0]?.state).toBe("uncertain");
      rejectNextCreate = true;
      await expect(payInvoice(id, client)).rejects.toMatchObject({
        code: "CHECKOUT_PENDING",
      });
      expect((await invoiceAttempts(original, id))[0]?.state).toBe("failed");
      const replacement = await payInvoice(id, client);
      const before = creates;
      transport.release();
      const resumed = await delayed;
      expect(creates).toBe(before);
      expect(resumed.error).toMatchObject({ code: "CHECKOUT_PENDING" });
      expect(resumed.value).toBeNull();
      expect((await payInvoice(id, client)).url).toBe(replacement.url);
      expect(
        (await invoiceAttempts(original, id)).filter(
          (attempt) => attempt.state === "open",
        ),
      ).toHaveLength(1);
    } finally {
      rejectNextCreate = false;
      transport.release();
      await delayed;
      await proxied.end({ timeout: 5 });
      globalThis.yinsenSql = original;
      await transport.close();
    }
  });
  it("rejects forged signatures and grants nothing for unpaid/unsupported events", async () => {
    await expect(handleStripeWebhook("{}", "forged")).rejects.toMatchObject({
      code: "INVALID_SIGNATURE",
    });
    const id = await invoice();
    const session = await sessionFor(id);
    await deliver(session);
    expect((await getInvoice(id, client)).status).toBe("sent");
    await deliver(session, "customer.created");
    expect((await getInvoice(id, client)).status).toBe("sent");
  });
  it("bounds the installed raw-body route and rejects forged signatures", async () => {
    const request = (body: string): Request =>
      new Request(`${process.env.APP_ORIGIN}/api/webhooks/stripe`, {
        method: "POST",
        headers: { "stripe-signature": "forged" },
        body,
      });
    expect((await webhookPost(request("{}"))).status).toBe(400);
    expect((await webhookPost(request("x".repeat(1048577)))).status).toBe(413);
  });
  it("closes an unpaid completed session on a later failure without reversing paid money", async () => {
    const id = await invoice();
    const session = await sessionFor(id);
    await deliver({ ...session, status: "complete" });
    await deliver(
      { ...session, status: "complete" },
      "checkout.session.async_payment_failed",
    );
    expect((await invoiceAttempts(getSql(), id))[0]?.state).toBe("failed");
    expect((await getInvoice(id, client)).status).toBe("sent");
    expect((await sessionFor(id)).id).not.toBe(session.id);
    for (const type of [
      "checkout.session.async_payment_failed",
      "checkout.session.expired",
    ]) {
      const otherId = await invoice();
      const other = await sessionFor(otherId);
      await deliver(other, type);
      await deliver({ ...other, status: "complete" });
      expect(["failed", "expired"]).toContain(
        (await invoiceAttempts(getSql(), otherId))[0]?.state,
      );
      expect((await sessionFor(otherId)).id).not.toBe(other.id);
    }
  });
  it("uses the shared money/release writer once and preserves a later manual relock", async () => {
    const id = await invoice();
    const session = paid(await sessionFor(id));
    const attempt = (await invoiceAttempts(getSql(), id))[0];
    expect(attempt && matchesAttempt(session, attempt)).toBe(true);
    const eventId = `evt_${randomUUID()}`;
    await deliver(session, undefined, eventId);
    expect((await getInvoice(id, client)).status).toBe("paid");
    expect(
      (await getSql()`select released from deliverables where id=${fileId}`)[0]
        ?.released,
    ).toBe(true);
    await releaseDeliverable(fileId, { released: false }, actor);
    await deliver(session, undefined, eventId);
    await deliver(session);
    await deliver(
      { ...session, payment_status: "unpaid" },
      "checkout.session.expired",
    );
    expect(
      (await getSql()`select released from deliverables where id=${fileId}`)[0]
        ?.released,
    ).toBe(false);
    expect(
      (
        await getSql()`select 1 from stripe_payments where payment_id=${typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? "")}`
      ).length,
    ).toBe(1);
    expect((await getInvoice(id, client)).status).toBe("paid");
  });
  it("retains wrong amount/currency/correlation as exceptions without release or payment", async () => {
    for (const change of [
      { amount_total: 1 },
      { currency: "eur" },
      { client_reference_id: randomUUID() },
    ]) {
      const id = await invoice();
      const session = { ...paid(await sessionFor(id)), ...change };
      await deliver(session);
      expect((await getInvoice(id, client)).status).toBe("sent");
      expect(
        (await paymentExceptions(actor)).some(
          (value) => value.invoiceId === id,
        ),
      ).toBe(true);
    }
  });
  it("retains old sessions and processes a genuine old payment before a distinct late payment", async () => {
    const id = await invoice();
    const old = await sessionFor(id);
    await deliver({ ...old, status: "expired" }, "checkout.session.expired");
    const current = await sessionFor(id);
    expect(current.id).not.toBe(old.id);
    await deliver(paid(old));
    expect((await getInvoice(id, client)).status).toBe("paid");
    await deliver(paid(current));
    expect(
      (await paymentExceptions(actor)).some((value) => value.invoiceId === id),
    ).toBe(true);
    expect((await invoiceAttempts(getSql(), id)).length).toBe(2);
  });
  it("keeps cancelled/deleted historical payments visible and records external resolution", async () => {
    const id = await invoice();
    const session = paid(await sessionFor(id));
    failExpire = true;
    await cancelInvoice(id, actor, true);
    failExpire = false;
    expect(
      (await checkoutProblems(actor)).some((value) => value.invoiceId === id),
    ).toBe(true);
    await expect(checkoutProblems(client)).rejects.toMatchObject({
      statusCode: 403,
    });
    const attempt = (await invoiceAttempts(getSql(), id))[0];
    await reconcileCheckout(
      id,
      { attemptId: attempt?.id, sessionId: session.id },
      actor,
    );
    expect(
      (await checkoutProblems(actor)).some((value) => value.invoiceId === id),
    ).toBe(false);
    await deliver(session);
    await expect(getInvoice(id, actor)).rejects.toMatchObject({
      statusCode: 404,
    });
    const exception = (await paymentExceptions(actor)).find(
      (value) => value.invoiceId === id,
    );
    expect(exception).toBeTruthy();
    await resolvePaymentException(
      id,
      {
        paymentId: exception?.paymentId,
        resolution: "Reviewed in Stripe; handled externally.",
      },
      actor,
    );
    expect(
      (await paymentExceptions(actor)).find((value) => value.invoiceId === id)
        ?.resolution,
    ).toContain("Reviewed");
    await expect(paymentExceptions(client)).rejects.toMatchObject({
      statusCode: 403,
    });
  });
  it("serializes manual settlement and paid callbacks while retaining expiration failure", async () => {
    const id = await invoice();
    const session = paid(await sessionFor(id));
    failExpire = true;
    await settleInvoice(
      id,
      {
        amountReceived: 12000,
        paymentMethod: "bank_transfer",
        reference: "External bank receipt",
      },
      actor,
    );
    failExpire = false;
    expect((await invoiceAttempts(getSql(), id))[0]?.expirationFailed).toBe(
      true,
    );
    await deliver(session);
    expect((await getInvoice(id, client)).status).toBe("settled");
    expect(
      (await paymentExceptions(actor)).some((value) => value.invoiceId === id),
    ).toBe(true);
  });
  it("serializes a racing full settlement and payment without duplicate revenue", async () => {
    const id = await invoice("GBP", false);
    const session = paid(await sessionFor(id));
    const results = await Promise.allSettled([
      settleInvoice(
        id,
        {
          amountReceived: 12000,
          paymentMethod: "bank_transfer",
          reference: "Racing receipt",
        },
        actor,
      ),
      deliver(session),
    ]);
    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    const status = (await getInvoice(id, client)).status;
    expect(["paid", "settled"]).toContain(status);
    const records =
      await getSql()`select p.exception from stripe_payments p join checkout_attempts a on a.id=p.attempt_id where a.invoice_id=${id}`;
    expect(records).toHaveLength(1);
    expect(Boolean(records[0]?.exception)).toBe(status === "settled");
  });
  it("records signed payment and releases linked files after project deletion", async () => {
    const id = await invoice();
    const session = paid(await sessionFor(id));
    await releaseDeliverable(fileId, { released: false }, actor);
    await deleteProject(projectId, actor);
    await deliver(session);
    expect((await getInvoice(id, client)).status).toBe("paid");
    expect(
      (await getSql()`select released from deliverables where id=${fileId}`)[0]
        ?.released,
    ).toBe(true);
    expect(
      (await getSql()`select deleted_at from projects where id=${projectId}`)[0]
        ?.deleted_at,
    ).not.toBeNull();
    expect(
      await getSql()`select 1 from stripe_payments where session_id=${session.id}`,
    ).toHaveLength(1);
  });
  it("retains the no-provider manual invoice path", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    vi.mocked(provider.stripeClient).mockImplementation(actualStripeClient);
    const id = await invoice("GBP", false);
    await expect(payInvoice(id, client)).rejects.toMatchObject({
      code: "STRIPE_UNAVAILABLE",
    });
    expect(
      (
        await settleInvoice(
          id,
          {
            amountReceived: 12000,
            paymentMethod: "cash",
            reference: "Manual provider-free receipt",
          },
          actor,
        )
      ).status,
    ).toBe("settled");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fixture");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", signing);
    vi.mocked(provider.stripeClient).mockReturnValue(sdk);
  });
});
