import type { ReactElement } from "react";
import { operatorForPage } from "../../../../lib/auth/page";
import { InvoiceWorkspace } from "../../../../components/invoice-views";
export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactElement> {
  return (
    <InvoiceWorkspace id={(await params).id} actor={await operatorForPage()} />
  );
}
