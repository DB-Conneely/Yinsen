import { apiResponse, readJson } from "../../../../lib/http";
import {
  destroyOperatorSession,
  requestToken,
  requireOperatorToken,
  sessionCookie,
} from "../../../../lib/auth/session";

export async function POST(request: Request): Promise<Response> {
  const response = await apiResponse(async () => {
    await readJson(request);
    const token = requestToken(request);
    await requireOperatorToken(token);
    if (token) await destroyOperatorSession(token);
    return { loggedOut: true };
  });
  if (response.ok) response.headers.set("Set-Cookie", sessionCookie("", 0));
  return response;
}
