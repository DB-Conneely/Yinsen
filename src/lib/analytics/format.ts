import { currencyDigits } from "../money";

export function analyticsMoney(amount: string, currency: string): string {
  const digits = currencyDigits(currency);
  const units = 10n ** BigInt(digits);
  const value = BigInt(amount);
  const whole = (value / units).toLocaleString("en-GB");
  const fraction = (value % units).toString().padStart(digits, "0");
  return `${currency} ${whole}${digits ? `.${fraction}` : ""}`;
}

export function barPercent(amount: string, maximum: string): number {
  const max = BigInt(maximum);
  return max === 0n ? 0 : Number((BigInt(amount) * 10000n) / max) / 100;
}

export function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

export function activityLabel(event: string): string {
  const labels: Record<string, string> = {
    "project.accepted": "Project completed",
    "project.disputed": "Changes requested",
    "project.submitted_for_approval": "Completion review requested",
    "project.archived": "Project archived",
    "project.pending_lockin": "Scope agreement requested",
    "invoice.settled": "Payment recorded",
    "invoice.paid": "Online payment received",
    "message.sent": "Message sent",
  };
  return labels[event] ?? event.replaceAll(/[._]/g, " ");
}

export function monthlyChange(current: string, previous: string): string {
  const last = BigInt(previous);
  const now = BigInt(current);
  if (last === 0n)
    return now === 0n
      ? "No change from previous month"
      : "First receipts since previous month";
  const change = ((now - last) * 1000n) / last;
  const absolute = change < 0n ? -change : change;
  return `${change > 0n ? "+" : change < 0n ? "−" : ""}${absolute / 10n}.${absolute % 10n}% vs previous month`;
}
