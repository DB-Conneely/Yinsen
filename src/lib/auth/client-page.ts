import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "./session";
import { validateClientSession, type ClientIdentity } from "./client";
export async function clientForPage(): Promise<ClientIdentity> {
  const identity = await validateClientSession(
    (await cookies()).get(SESSION_COOKIE)?.value,
  );
  if (!identity) redirect("/portal/login");
  return identity;
}
