import { AppError } from "../errors";

const attempts = new Map<string, { count: number; until: number }>();

export function consumeLoginAttempt(address: string, now = Date.now()): void {
  // Bounded by live transport IPs, never by caller-controlled forwarded headers.
  for (const [key, entry] of attempts)
    if (entry.until <= now) attempts.delete(key);
  let entry = attempts.get(address);
  if (!entry) {
    if (attempts.size >= 10000)
      throw new AppError(
        429,
        "RATE_LIMITED",
        "Too many attempts. Try again in 15 minutes.",
      );
    entry = { count: 0, until: now + 15 * 60 * 1000 };
    attempts.set(address, entry);
  }
  if (entry.count >= 5)
    throw new AppError(
      429,
      "RATE_LIMITED",
      `Too many attempts. Try again in ${Math.max(1, Math.ceil((entry.until - now) / 60000))} minutes.`,
    );
  entry.count += 1;
}
