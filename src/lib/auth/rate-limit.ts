import { AppError } from "../errors";
import { tokenDigest } from "./session";

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

const clientAttempts = new Map<string, { count: number; until: number }>();
export function consumeClientAttempt(
  address: string,
  email?: string,
  now = Date.now(),
): void {
  for (const [key, entry] of clientAttempts)
    if (entry.until <= now) clientAttempts.delete(key);
  const keys: [string, number][] = [
    [`ip:${address}`, email === undefined ? 30 : 10],
  ];
  if (email !== undefined) keys.push([`email:${tokenDigest(email)}`, 3]);
  for (const [key, limit] of keys) {
    const current = clientAttempts.get(key);
    if (
      (current && current.count >= limit) ||
      (!current && clientAttempts.size >= 20000)
    )
      throw new AppError(
        429,
        "RATE_LIMITED",
        "Too many requests. Try again in 15 minutes.",
      );
  }
  for (const [key] of keys) {
    const current = clientAttempts.get(key) ?? {
      count: 0,
      until: now + 15 * 60 * 1000,
    };
    current.count++;
    clientAttempts.set(key, current);
  }
}
