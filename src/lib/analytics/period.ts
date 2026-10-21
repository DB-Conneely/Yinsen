import { z } from "zod";

export const analyticsPeriod = z.enum(["30d", "90d", "12m", "all"]);
export type AnalyticsPeriod = z.infer<typeof analyticsPeriod>;
export type AnalyticsWindow = {
  period: AnalyticsPeriod;
  from: string | null;
  asOf: string;
};

export function analyticsWindow(input: unknown, now: Date): AnalyticsWindow {
  const period = analyticsPeriod.default("30d").parse(input);
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  if (period === "12m") {
    start.setUTCDate(1);
    start.setUTCMonth(start.getUTCMonth() - 11);
  } else if (period !== "all") {
    start.setUTCDate(start.getUTCDate() - (period === "30d" ? 29 : 89));
  }
  return {
    period,
    from: period === "all" ? null : start.toISOString(),
    asOf: now.toISOString(),
  };
}
