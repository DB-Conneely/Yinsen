import { apiResponse } from "../../../../lib/http";
import {
  requestToken,
  requireOperatorToken,
  sessionCookie,
} from "../../../../lib/auth/session";
import { validateClientSession } from "../../../../lib/auth/client";

export async function GET(request: Request): Promise<Response> {
  const token = requestToken(request);
  let operator = false;
  const response = await apiResponse(async () => {
    const client = await validateClientSession(token);
    if (client) return client;
    const identity = await requireOperatorToken(token);
    operator = true;
    return identity;
  });
  if (operator && token)
    response.headers.set("Set-Cookie", sessionCookie(token));
  return response;
}
