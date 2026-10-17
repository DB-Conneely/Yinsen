import { apiResponse } from "../../../../lib/http";
import {
  requestToken,
  requireOperatorToken,
  sessionCookie,
} from "../../../../lib/auth/session";

export async function GET(request: Request): Promise<Response> {
  const token = requestToken(request);
  const response = await apiResponse(() => requireOperatorToken(token));
  if (response.ok && token)
    response.headers.set("Set-Cookie", sessionCookie(token));
  return response;
}
