import { z } from "zod";
import { randomUUID } from "node:crypto";
import { readConfiguration } from "../config";
import { AppError } from "../errors";
import type { InvoiceDetail } from "../invoices/queries";
import { formatBudget } from "../money";

async function resend(
  path: string,
  body?: unknown,
  idempotency?: string,
): Promise<unknown> {
  const email = readConfiguration().email;
  if (!email)
    throw new AppError(
      503,
      "EMAIL_UNAVAILABLE",
      "Email is not configured. Contact the operator for a login link.",
    );
  try {
    const response = await fetch(`https://api.resend.com${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${email.key}`,
        "Content-Type": "application/json",
        ...(idempotency ? { "Idempotency-Key": idempotency } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw new AppError(
        503,
        "EMAIL_UNAVAILABLE",
        "Email service could not complete the request. Contact the operator or try again later.",
      );
    return (await response.json()) as unknown;
  } catch (error: unknown) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      503,
      "EMAIL_UNAVAILABLE",
      "Email service could not complete the request. Contact the operator or try again later.",
    );
  }
}

export async function verifyEmail(): Promise<
  "skipped" | "accepted" | "failed"
> {
  const email = readConfiguration().email;
  if (!email) return "skipped";
  try {
    z.object({ id: z.uuid() }).parse(
      await resend(
        "/emails",
        {
          from: email.from,
          to: ["delivered@resend.dev"],
          subject: "Portal email configuration test",
          text: "This operator-triggered configuration test checks that the configured sender can submit email. It contains no login link or personal information.",
        },
        `setup-test/${randomUUID()}`,
      ),
    );
    return "accepted";
  } catch {
    return "failed";
  }
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ] ?? character,
  );
}

function actionTextColour(background: string): "#000000" | "#ffffff" {
  const channels = background.match(/[a-f0-9]{2}/gi) ?? [];
  const luminance = channels.reduce((sum, channel, index) => {
    const value = parseInt(channel, 16) / 255;
    const linear =
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    return sum + linear * ([0.2126, 0.7152, 0.0722][index] ?? 0);
  }, 0);
  return luminance > 0.179 ? "#000000" : "#ffffff";
}

export async function sendMagicLink(input: {
  to: string;
  name: string;
  url: string;
  brandName: string;
  brandColour: string;
  key: string;
}): Promise<string> {
  const email = readConfiguration().email;
  if (!email)
    throw new AppError(503, "EMAIL_UNAVAILABLE", "Email is not configured.");
  const html = `<div style="max-width:600px;margin:auto;font-family:system-ui"><h1>${escapeHtml(input.brandName)}</h1><p>Hi ${escapeHtml(input.name)},</p><p>Use this single-use link to sign in. It expires in 15 minutes.</p><p><a style="display:inline-block;padding:16px;background:${escapeHtml(input.brandColour)};color:${actionTextColour(input.brandColour)}" href="${escapeHtml(input.url)}">Sign in to your portal</a></p><p>If you did not request this, ignore this email.</p></div>`;
  const result = z.object({ id: z.uuid() }).safeParse(
    await resend(
      "/emails",
      {
        from: email.from,
        to: [input.to],
        subject: `Sign in to ${input.brandName}`,
        html,
        text: `Hi ${input.name},\nSign in to ${input.brandName}: ${input.url}\nThis single-use link expires in 15 minutes. If you did not request it, ignore this email.`,
      },
      input.key,
    ),
  );
  if (!result.success)
    throw new AppError(
      503,
      "EMAIL_UNAVAILABLE",
      "Email service returned an invalid response.",
    );
  return result.data.id;
}

export async function sendInvoiceEmail(input: {
  invoice: InvoiceDetail;
  url: string;
}): Promise<string> {
  const email = readConfiguration().email;
  if (!email)
    throw new AppError(503, "EMAIL_UNAVAILABLE", "Email is not configured.");
  const invoice = input.invoice;
  const amount = formatBudget(invoice.amount, invoice.currency);
  const summary = `Invoice ${invoice.number}: ${amount}${invoice.dueDate ? `, due ${invoice.dueDate}` : ""}`;
  const html = `<div style="max-width:600px;margin:auto;font-family:system-ui"><h1>${escapeHtml(invoice.issuerName)}</h1><p>Hi ${escapeHtml(invoice.recipientName)},</p><h2>${escapeHtml(summary)}</h2><p>Your invoice is ready. Sign in with your client account to review the complete items and payment instructions.</p><p><a style="display:inline-block;padding:16px;background:${escapeHtml(invoice.brandColour)};color:${actionTextColour(invoice.brandColour)}" href="${escapeHtml(input.url)}">View invoice</a></p><p>${escapeHtml(invoice.issuerEmail)}</p></div>`;
  const result = z.object({ id: z.uuid() }).safeParse(
    await resend(
      "/emails",
      {
        from: email.from,
        to: [invoice.recipientEmail],
        subject: `New invoice from ${invoice.issuerName}: ${invoice.number}`,
        html,
        text: `Hi ${invoice.recipientName},\n${summary}\nReview your invoice from ${invoice.issuerName}: ${input.url}\nSign in with your client account.\n${invoice.issuerEmail}`,
      },
      `invoice/${invoice.id}/${invoice.revision}`,
    ),
  );
  if (!result.success)
    throw new AppError(
      503,
      "EMAIL_UNAVAILABLE",
      "Email service returned an invalid response. Invoice remains a draft; please retry.",
    );
  return result.data.id;
}
