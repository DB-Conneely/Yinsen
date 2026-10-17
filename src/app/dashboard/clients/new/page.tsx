import type { ReactElement } from "react";
import { operatorForPage } from "../../../../lib/auth/page";
import { ClientForm } from "../../../../components/client-forms";
export default async function NewClient(): Promise<ReactElement> {
  await operatorForPage();
  return (
    <>
      <h1>New client</h1>
      <ClientForm />
    </>
  );
}
