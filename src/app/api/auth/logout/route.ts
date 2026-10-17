import { apiResponse, readJson } from "../../../../lib/http";
import {
  destroyOperatorSession,
  requestToken,
  requireOperatorToken,
  sessionCookie,
} from "../../../../lib/auth/session";
import {
  destroyClientSession,
  validateClientSession,
} from "../../../../lib/auth/client";

export async function POST(request: Request): Promise<Response> {
  const response = await apiResponse(async () => {
    await readJson(request);
    const token = requestToken(request);
    const client = await validateClientSession(token);
    if (client && token) await destroyClientSession(token);
    else {
      await requireOperatorToken(token);
      if (token) await destroyOperatorSession(token);
    }
    return { loggedOut: true };
  });
  if (response.ok) response.headers.set("Set-Cookie", sessionCookie("", 0));
  return response;
}
