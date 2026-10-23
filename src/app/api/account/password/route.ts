import { apiResponse, readJson } from "../../../../lib/http";
import { requestToken, sessionCookie } from "../../../../lib/auth/session";
import { changePassword } from "../../../../lib/auth/account";
import type { Session } from "../../../../lib/auth/session";
export async function POST(request: Request): Promise<Response> {
  let session: Session | undefined;
  const response = await apiResponse(async () => {
    const result = await changePassword(
      await readJson(request),
      requestToken(request),
    );
    session = result.session;
    return { saved: true };
  });
  if (response.ok && session)
    response.headers.set("Set-Cookie", sessionCookie(session.token));
  return response;
}
