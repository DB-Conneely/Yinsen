import { AppError } from "./errors";

export function currencyDigits(currency: string): number {
  if (!/^[A-Z]{3}$/.test(currency))
    throw new AppError(
      400,
      "INVALID_CURRENCY",
      "Enter a three-letter currency code.",
    );
  return (
    new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2
  );
}

export function minorAmount(value: string, currency: string): number | null {
  if (!value) return null;
  const digits = currencyDigits(currency);
  const pattern = digits
    ? new RegExp(`^\\d+(?:\\.\\d{1,${digits}})?$`)
    : /^\d+$/;
  if (!pattern.test(value))
    throw new AppError(
      400,
      "INVALID_AMOUNT",
      `Enter a budget with at most ${digits} decimal places for ${currency}.`,
    );
  const [whole = "0", fraction = ""] = value.split(".");
  const amount =
    Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, "0"));
  if (!Number.isSafeInteger(amount) || amount > 2147483647)
    throw new AppError(
      400,
      "INVALID_AMOUNT",
      "This budget is too large. Enter a smaller amount.",
    );
  return amount;
}

export function budgetInput(amount: number | null, currency: string): string {
  return amount === null
    ? ""
    : (amount / 10 ** currencyDigits(currency)).toFixed(
        currencyDigits(currency),
      );
}

export function formatBudget(amount: number | null, currency: string): string {
  if (amount === null) return "Budget not set";
  // Older browser ICU lacks XCG's symbol; its code keeps server/client totals identical.
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    currencyDisplay: currency === "XCG" ? "code" : "symbol",
  }).format(amount / 10 ** currencyDigits(currency));
}
