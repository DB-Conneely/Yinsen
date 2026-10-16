import pino from "pino";

export const logger = pino({ level: "info", base: undefined });

export function logFailure(code: string, correlationId: string): void {
  logger.error({ code, correlationId }, "Request failed");
}
