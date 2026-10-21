import type { ReactElement } from "react";
import { operatorForPage } from "../../lib/auth/page";
import { readAnalytics } from "../../lib/analytics/queries";
import { DashboardView } from "../../components/analytics-views";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Operator dashboard" };

export default async function Dashboard(): Promise<ReactElement> {
  const identity = await operatorForPage();
  return (
    <DashboardView
      name={identity.name}
      snapshot={await readAnalytics(identity, "12m")}
    />
  );
}
