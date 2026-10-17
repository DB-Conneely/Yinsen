import type { ReactElement } from "react";
import { notFound } from "next/navigation";
import { isSetupComplete } from "../../lib/setup/service";
import { SetupWizard } from "../../components/setup-wizard";

export const dynamic = "force-dynamic";

export default async function Setup(): Promise<ReactElement> {
  if (await isSetupComplete()) notFound();
  return <SetupWizard />;
}
