import type { ReactElement } from "react";
import type { Metadata } from "next";
import { operatorForPage } from "../../../lib/auth/page";
import { readAnalytics } from "../../../lib/analytics/queries";
import { AnalyticsView } from "../../../components/analytics-views";

export const metadata: Metadata = { title: "Analytics" };

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}): Promise<ReactElement> {
  const identity = await operatorForPage();
  const { period } = await searchParams;
  return <AnalyticsView snapshot={await readAnalytics(identity, period)} />;
}
