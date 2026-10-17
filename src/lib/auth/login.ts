import { getSql } from "../db/client";
import { AppError } from "../errors";
import { comparePassword, hashPassword } from "./password";
import { loginSchema } from "./validation";
import {
  createOperatorSession,
  type OperatorIdentity,
  type Session,
} from "./session";

let dummyHash: Promise<string> | undefined;

export async function loginOperator(
  input: unknown,
): Promise<{ user: OperatorIdentity; session: Session }> {
  const data = loginSchema.parse(input);
  const rows = await getSql()<
    { id: string; name: string; email: string; password_hash: string }[]
  >`select id, name, email, password_hash from operator where email = ${data.email}`;
  const operator = rows[0];
  dummyHash ??= hashPassword("unused-timing-password-9a!");
  const valid = await comparePassword(
    data.password,
    operator?.password_hash ?? (await dummyHash),
  );
  if (!operator || !valid)
    throw new AppError(
      401,
      "INVALID_CREDENTIALS",
      "Invalid email or password.",
    );
  const session = await createOperatorSession(operator.id);
  return {
    user: {
      id: operator.id,
      name: operator.name,
      email: operator.email,
      role: "operator",
    },
    session,
  };
}
