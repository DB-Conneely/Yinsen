import type { ReactElement } from "react";
import { operatorForPage } from "../../../../../lib/auth/page";
import { InvoiceEditor } from "../../../../../components/invoice-views";
export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactElement> {
  return (
    <InvoiceEditor id={(await params).id} actor={await operatorForPage()} />
  );
}
