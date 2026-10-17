import type { ReactElement } from "react";
import { operatorForPage } from "../../../../lib/auth/page";
import { InvoiceEditor } from "../../../../components/invoice-views";
export default async function NewInvoicePage(): Promise<ReactElement> {
  return <InvoiceEditor actor={await operatorForPage()} />;
}
