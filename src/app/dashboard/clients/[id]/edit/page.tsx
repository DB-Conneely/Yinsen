import type { ReactElement } from "react";
import { notFound, redirect } from "next/navigation";
import { operatorForPage } from "../../../../../lib/auth/page";
import { getClient, clientId } from "../../../../../lib/clients/service";
import { ClientForm } from "../../../../../components/client-forms";
import { AppError } from "../../../../../lib/errors";
export default async function EditClient({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactElement> {
  await operatorForPage();
  const { id } = await params;
  if (!clientId.safeParse(id).success) notFound();
  const client = await getClient(id).catch((error: unknown) => {
    if (error instanceof AppError && error.statusCode === 404) notFound();
    throw error;
  });
  if (client.deletedAt) redirect(`/dashboard/clients/${id}`);
  return (
    <>
      <h1>Edit client</h1>
      <ClientForm client={client} />
    </>
  );
}
