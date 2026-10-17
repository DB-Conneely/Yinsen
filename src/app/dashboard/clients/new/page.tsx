import type { ReactElement } from "react";
import { operatorForPage } from "../../../../lib/auth/page";
import { ClientForm } from "../../../../components/client-forms";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "New client" };

export default async function NewClient(): Promise<ReactElement> {
  await operatorForPage();
  return (
    <>
      <h1>New client</h1>
      <ClientForm />
    </>
  );
}
