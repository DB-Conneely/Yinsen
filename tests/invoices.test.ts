import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getSql } from "../src/lib/db/client";
import { completeSetup, isSetupComplete } from "../src/lib/setup/service";
import { loginOperator } from "../src/lib/auth/login";
import { saveClient } from "../src/lib/clients/service";
import { saveProject } from "../src/lib/projects/service";
import { getProject } from "../src/lib/projects/queries";
import {
  createMilestone,
  mutateMilestone,
} from "../src/lib/milestones/service";
import { readDeliverableUpload } from "../src/lib/storage/upload";
import {
  uploadDeliverable,
  releaseDeliverable,
} from "../src/lib/deliverables/service";
import {
  invoiceFields,
  invoiceTotals,
  invoiceDefaults,
  settlementInput,
} from "../src/lib/invoices/validation";
import {
  createInvoice,
  updateInvoice,
  sendInvoice,
  settleInvoice,
  cancelInvoice,
  saveInvoiceDefaults,
  withInvoiceLock,
  writeMoneyReceived,
} from "../src/lib/invoices/service";
import {
  getInvoice,
  listInvoices,
  invoiceChoices,
} from "../src/lib/invoices/queries";
import { markOverdueInvoices } from "../src/lib/invoices/overdue";
import { sendInvoiceEmail } from "../src/lib/email/resend";
import type { ProjectActor } from "../src/lib/projects/access";
import { getBranding } from "../src/lib/settings";

let actor: { id: string; role: "operator" };
let client: ProjectActor, outsider: ProjectActor;
let projectId: string, milestoneId: string, fileId: string;
const fields = (): ReturnType<typeof invoiceFields.parse> =>
  invoiceFields.parse({
    clientId: client.id,
    projectId,
    currency: "GBP",
    lineItems: [
      { description: "Brand design", quantity: "1.25", unitPrice: 10001 },
    ],
    milestoneIds: [milestoneId],
  });
const create = (): ReturnType<typeof createInvoice> =>
  createInvoice({ ...fields(), requestId: randomUUID() }, actor);
async function upload(parent?: string): Promise<string> {
  const body = new FormData();
  body.set("requestId", randomUUID());
  if (parent) body.set("parentDeliverableId", parent);
  body.set(
    "file",
    new Blob(["Invoice released bytes\n"], { type: "text/plain" }),
    "design.txt",
  );
  const request = new Request(`${process.env.APP_ORIGIN}/api/upload`, {
    method: "POST",
    headers: { origin: process.env.APP_ORIGIN ?? "" },
    body,
  });
  return (
    await uploadDeliverable(
      milestoneId,
      await readDeliverableUpload(request),
      actor,
    )
  ).id;
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
      { name: "Invoice recipient", email: `${randomUUID()}@example.test` },
      actor,
    )),
    role: "client",
  };
  outsider = {
    ...(await saveClient(
      { name: "Invoice outsider", email: `${randomUUID()}@example.test` },
      actor,
    )),
    role: "client",
  };
  const project = await saveProject(
    {
      name: "Invoice release work",
      currency: "GBP",
      clientIds: [client.id, outsider.id],
    },
    actor,
  );
  projectId = project.id;
  milestoneId =
    (await createMilestone(projectId, { name: "Design" }, actor)).milestones[0]
      ?.id ?? "";
  fileId = await upload();
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await getSql().end({ timeout: 5 });
});

describe("invoice money and frozen identity", () => {
  it("distinguishes same-name recipient choices by their stored email and ID", async () => {
    const recipients = await Promise.all(
      ["first", "second"].map(async (label) => {
        const email = `${label}-${randomUUID()}@example.test`;
        const saved = await saveClient(
          { name: "Same-name invoice recipient", email },
          actor,
        );
        return { id: saved.id, name: "Same-name invoice recipient", email };
      }),
    );
    const choices = await invoiceChoices(actor);
    for (const recipient of recipients)
      expect(choices.clients.find((item) => item.id === recipient.id)).toEqual(
        recipient,
      );
  });
  it("rounds decimal quantities half up without float math and validates bounds", () => {
    expect(invoiceTotals(fields()).amount).toBe(12501);
    expect(
      invoiceTotals({
        ...fields(),
        lineItems: [{ description: "Half", quantity: "0.50", unitPrice: 1 }],
      }).amount,
    ).toBe(1);
    expect(invoiceTotals({ ...fields(), totalOverride: 12000 }).amount).toBe(
      12000,
    );
    expect(() =>
      invoiceTotals({
        ...fields(),
        lineItems: [
          {
            description: "Overflow",
            quantity: "9999999",
            unitPrice: 2147483647,
          },
        ],
      }),
    ).toThrow("too large");
    expect(() =>
      invoiceFields.parse({ ...fields(), currency: "XYZ" }),
    ).toThrow();
    expect(() =>
      settlementInput.parse({
        amountReceived: 1,
        paymentMethod: "other",
        reference: " ",
      }),
    ).toThrow();
    expect(() =>
      invoiceDefaults.parse({
        invoicePrefix: "../",
        invoiceNextNumber: 1,
        paymentInstructions: "",
      }),
    ).toThrow();
  });
  it("keeps currency validation stable when browser ICU omits newer currencies", () => {
    const supported = vi
      .spyOn(Intl, "supportedValuesOf")
      .mockReturnValue(["GBP"]);
    try {
      expect(
        invoiceFields.parse({ ...fields(), currency: "SLE" }).currency,
      ).toBe("SLE");
    } finally {
      supported.mockRestore();
    }
  });
  it("allocates unique immutable numbers concurrently and rejects cancelled-number reuse", async () => {
    const invoices = await Promise.all(
      Array.from({ length: 8 }, () => create()),
    );
    expect(new Set(invoices.map((invoice) => invoice.number)).size).toBe(8);
    await cancelInvoice(invoices[0]?.id ?? "", actor, true);
    await expect(
      saveInvoiceDefaults(
        { invoicePrefix: "INV", invoiceNextNumber: 1, paymentInstructions: "" },
        actor,
      ),
    ).rejects.toMatchObject({ code: "NUMBER_REUSE" });
    const prefix = `T${randomUUID().slice(0, 6).toUpperCase()}`;
    await saveInvoiceDefaults(
      {
        invoicePrefix: prefix,
        invoiceNextNumber: 10,
        paymentInstructions: "Use invoice number",
      },
      actor,
    );
    expect((await create()).number).toBe(`${prefix}-010`);
  });
  it("keeps drafts private, denies forged associations and checks recipient identity independently of membership", async () => {
    const invoice = await create();
    await expect(getInvoice(invoice.id, client)).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(
      createInvoice(
        { ...fields(), requestId: randomUUID(), projectId: null },
        actor,
      ),
    ).rejects.toMatchObject({ code: "INVALID_ASSOCIATION" });
    const otherProject = await saveProject(
      { name: "Foreign", currency: "GBP", clientIds: [outsider.id] },
      actor,
    );
    await expect(
      createInvoice(
        { ...fields(), requestId: randomUUID(), projectId: otherProject.id },
        actor,
      ),
    ).rejects.toMatchObject({ code: "INVALID_ASSOCIATION" });
    const sent = await sendInvoice(
      invoice.id,
      { expectedRevision: invoice.revision },
      actor,
    );
    expect((await getInvoice(sent.id, client)).recipientName).toBe(
      "Invoice recipient",
    );
    await expect(getInvoice(sent.id, outsider)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(
      (
        await getSql()`select id from project_activity where project_id=${projectId} and event_type like 'invoice.%'`
      ).length,
    ).toBe(0);
    await getSql()`insert into project_activity(project_id,actor_id,actor_type,event_type) values(${projectId},${actor.id},'operator','invoice.sent')`;
    expect(
      (await getProject(projectId, outsider)).activity.some((event) =>
        event.eventType.startsWith("invoice."),
      ),
    ).toBe(false);
    expect(
      (
        await getSql()`select id from activity_events where client_id=${client.id} and event_type='invoice.sent'`
      ).length,
    ).toBe(1);
    await getSql().begin(async (holder) => {
      await holder`select id from invoices where id=${sent.id} for update`;
      await expect(getInvoice(sent.id, outsider)).rejects.toMatchObject({
        statusCode: 404,
      });
      await expect(getInvoice(randomUUID(), outsider)).rejects.toMatchObject({
        statusCode: 404,
      });
    });
    expect(
      (await listInvoices(outsider)).some((item) => item.id === sent.id),
    ).toBe(false);
    await expect(
      updateInvoice(
        sent.id,
        { ...fields(), expectedRevision: sent.revision },
        actor,
      ),
    ).rejects.toMatchObject({ code: "INVOICE_FROZEN" });
    await expect(
      sendInvoice(sent.id, { expectedRevision: sent.revision }, actor),
    ).rejects.toMatchObject({ code: "INVOICE_FROZEN" });
    await expect(
      mutateMilestone(milestoneId, {}, actor, "delete"),
    ).rejects.toMatchObject({ code: "INVOICED_MILESTONE" });
    const choices = await invoiceChoices(actor);
    expect(
      choices.projects.find((item) => item.id === projectId)?.clientIds,
    ).toContain(client.id);
    await expect(invoiceChoices(client)).rejects.toMatchObject({
      statusCode: 403,
    });
  });
  it("updates only the reviewed draft and preserves its allocated number", async () => {
    const draft = await create();
    const saved = await updateInvoice(
      draft.id,
      { ...fields(), totalOverride: 10000, expectedRevision: draft.revision },
      actor,
    );
    expect(saved.amount).toBe(10000);
    expect(saved.number).toBe(draft.number);
    await expect(
      updateInvoice(
        draft.id,
        { ...fields(), expectedRevision: draft.revision },
        actor,
      ),
    ).rejects.toMatchObject({ code: "INVOICE_CHANGED" });
    await expect(cancelInvoice(draft.id, client)).rejects.toMatchObject({
      statusCode: 403,
    });
    await cancelInvoice(draft.id, actor);
    await expect(getInvoice(draft.id, client)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe("the single full-payment release transition", () => {
  it("rejects short/excess amounts, then releases every version through any linked invoice while another remains unpaid", async () => {
    const version = await upload(fileId);
    const draft = await create(),
      other = await create();
    const invoice = await sendInvoice(
      draft.id,
      { expectedRevision: draft.revision },
      actor,
    );
    for (const amountReceived of [invoice.amount - 1, invoice.amount + 1])
      await expect(
        settleInvoice(
          invoice.id,
          {
            amountReceived,
            paymentMethod: "bank_transfer",
            reference: "Wrong amount",
          },
          actor,
        ),
      ).rejects.toMatchObject({ code: "AMOUNT_MISMATCH" });
    expect((await getInvoice(invoice.id, actor)).status).toBe("sent");
    expect(
      (await getSql()`select released from deliverables where id=${version}`)[0]
        ?.released,
    ).toBe(false);
    const receipt = {
      amountReceived: invoice.amount,
      paymentMethod: "bank_transfer",
      reference: "Bank receipt 123",
    };
    const settled = await settleInvoice(invoice.id, receipt, actor);
    expect(settled.status).toBe("settled");
    expect(settled.settlementData?.reference).toBe(receipt.reference);
    for (const amountReceived of [invoice.amount - 1, invoice.amount + 1])
      await expect(
        settleInvoice(invoice.id, { ...receipt, amountReceived }, actor),
      ).rejects.toMatchObject({ code: "AMOUNT_MISMATCH" });
    expect((await getInvoice(other.id, actor)).status).toBe("draft");
    const all =
      await getSql()`select released from deliverables where milestone_id=${milestoneId}`;
    expect(all.every((row) => row.released === true)).toBe(true);
    const later = await upload(fileId);
    await releaseDeliverable(version, { released: false }, actor);
    await Promise.all([
      settleInvoice(invoice.id, receipt, actor),
      settleInvoice(invoice.id, receipt, actor),
    ]);
    const flags =
      await getSql()`select id,released from deliverables where id in ${getSql()([version, later])}`;
    expect(flags.every((row) => row.released === false)).toBe(true);
    expect(
      (
        await getSql()`select id from activity_events where client_id=${client.id} and event_type='invoice.settled'`
      ).length,
    ).toBe(1);
    await expect(cancelInvoice(invoice.id, actor, true)).rejects.toMatchObject({
      code: "MONEY_RECEIVED",
    });
    await expect(
      mutateMilestone(milestoneId, {}, actor, "delete"),
    ).rejects.toMatchObject({ code: "INVOICED_MILESTONE" });
    const second = await sendInvoice(
      other.id,
      { expectedRevision: other.revision },
      actor,
    );
    await settleInvoice(
      second.id,
      { ...receipt, amountReceived: second.amount },
      actor,
    );
    expect(
      (await getSql()`select released from deliverables where id=${later}`)[0]
        ?.released,
    ).toBe(true);
  });
  it("never releases unlinked files and makes paid terminal through the same committed writer", async () => {
    const later = await upload(fileId);
    const draft = await createInvoice(
      { ...fields(), milestoneIds: [], requestId: randomUUID() },
      actor,
    );
    const sent = await sendInvoice(
      draft.id,
      { expectedRevision: draft.revision },
      actor,
    );
    const paid = await withInvoiceLock(sent.id, actor, (sql, invoice) =>
      writeMoneyReceived(
        sql,
        invoice,
        {
          status: "paid",
          amount: invoice.amount,
          currency: invoice.currency,
          reference: "native-test-provider-ref",
          paymentMethod: "provider",
        },
        actor,
      ),
    );
    expect(paid.status).toBe("paid");
    expect(
      (await getSql()`select released from deliverables where id=${later}`)[0]
        ?.released,
    ).toBe(false);
    await expect(cancelInvoice(paid.id, actor)).rejects.toMatchObject({
      code: "MONEY_RECEIVED",
    });
  });
  it("marks due sent invoices once and excludes drafts and terminal records", async () => {
    const draft = await createInvoice(
      { ...fields(), dueDate: "2000-01-01", requestId: randomUUID() },
      actor,
    );
    await sendInvoice(draft.id, { expectedRevision: draft.revision }, actor);
    await markOverdueInvoices();
    await markOverdueInvoices();
    expect((await getInvoice(draft.id, actor)).status).toBe("overdue");
    expect(
      (await listInvoices(actor, { status: "overdue" })).map((item) => item.id),
    ).toContain(draft.id);
    expect(
      (
        await getSql()`select id from activity_events where client_id=${client.id} and event_type='invoice.overdue'`
      ).length,
    ).toBe(1);
  });
});

describe("configured invoice email failure and exact retry", () => {
  it("keeps a provider failure draft, submits escaped branded terms and freezes after success", async () => {
    const key = process.env.RESEND_API_KEY,
      from = process.env.EMAIL_FROM_ADDRESS;
    process.env.RESEND_API_KEY = "re_synthetic";
    process.env.EMAIL_FROM_ADDRESS = "billing@example.test";
    try {
      const draft = await create();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response("{}", { status: 503 })),
      );
      await expect(
        sendInvoice(draft.id, { expectedRevision: draft.revision }, actor),
      ).rejects.toMatchObject({ code: "EMAIL_UNAVAILABLE" });
      const failed = await getInvoice(draft.id, actor);
      expect(failed.status).toBe("draft");
      expect(failed.emailFailed).toBe(true);
      const fetcher = vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(Response.json({ id: randomUUID() })),
        );
      vi.stubGlobal("fetch", fetcher);
      const sent = await sendInvoice(
        failed.id,
        { expectedRevision: failed.revision },
        actor,
      );
      expect(sent.status).toBe("sent");
      expect(fetcher.mock.calls[0]?.[0]).toBe("https://api.resend.com/emails");
      await sendInvoiceEmail({
        invoice: { ...sent, issuerName: "Studio <script>" },
        url: "https://example.test/portal?x=1&y=2",
      });
      const request: unknown = fetcher.mock.calls[1]?.[1];
      expect(JSON.stringify(request)).toContain("Studio &lt;script&gt;");
      expect(JSON.stringify(request)).toContain("Idempotency-Key");
    } finally {
      if (key === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = key;
      if (from === undefined) delete process.env.EMAIL_FROM_ADDRESS;
      else process.env.EMAIL_FROM_ADDRESS = from;
      vi.unstubAllGlobals();
    }
  });
});
