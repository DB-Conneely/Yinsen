import type { ReactElement } from "react";
import { operatorForPage } from "../../../lib/auth/page";
import { InvoiceList } from "../../../components/invoice-views";
export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}): Promise<ReactElement> {
  return (
    <InvoiceList
      actor={await operatorForPage()}
      status={(await searchParams).status}
    />
  );
}
