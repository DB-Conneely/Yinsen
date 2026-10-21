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
    {
      id: string;
      name: string;
      email: string;
      password_hash: string;
      auth_generation: number;
    }[]
  >`select id, name, email, password_hash, auth_generation from operator where email = ${data.email}`;
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
  return getSql().begin(async (sql) => {
    // Password changes and revoke-all take this same lock before invalidating credentials/sessions.
    const current = await sql<
      typeof rows
    >`select id,name,email,password_hash,auth_generation from operator where id=${operator.id} for update`;
    const saved = current[0];
    if (
      !saved ||
      saved.password_hash !== operator.password_hash ||
      saved.auth_generation !== operator.auth_generation ||
      saved.email !== data.email
    )
      throw new AppError(
        401,
        "INVALID_CREDENTIALS",
        "Invalid email or password.",
      );
    return {
      user: {
        id: saved.id,
        name: saved.name,
        email: saved.email,
        role: "operator" as const,
      },
      session: await createOperatorSession(saved.id, sql),
    };
  });
}
