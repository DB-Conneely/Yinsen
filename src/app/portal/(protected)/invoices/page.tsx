import type { ReactElement } from "react";
import { clientForPage } from "../../../../lib/auth/client-page";
import { InvoiceList } from "../../../../components/invoice-views";
export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}): Promise<ReactElement> {
  return (
    <InvoiceList
      actor={await clientForPage()}
      status={(await searchParams).status}
    />
  );
}
