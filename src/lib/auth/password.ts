import { compare, hash } from "bcryptjs";
import { passwordSchema } from "./validation";

export async function hashPassword(password: string): Promise<string> {
  return hash(passwordSchema.parse(password), 12);
}

export async function comparePassword(
  password: string,
  digest: string,
): Promise<boolean> {
  if (!passwordSchema.safeParse(password).success) return false;
  return compare(password, digest);
}
