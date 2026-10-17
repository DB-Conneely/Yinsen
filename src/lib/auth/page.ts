import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE,
  validateOperatorSession,
  type OperatorIdentity,
} from "./session";

export async function operatorForPage(): Promise<OperatorIdentity> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const identity = await validateOperatorSession(token);
  if (!identity) redirect("/login");
  return identity;
}
