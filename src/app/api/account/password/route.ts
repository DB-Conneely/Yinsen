import { apiResponse, readJson } from "../../../../lib/http";
import { requestToken, sessionCookie } from "../../../../lib/auth/session";
import { changePassword } from "../../../../lib/auth/account";
export async function POST(request: Request): Promise<Response> {
  const response = await apiResponse(async () =>
    changePassword(await readJson(request), requestToken(request)),
  );
  if (response.ok) response.headers.set("Set-Cookie", sessionCookie("", 0));
  return response;
}
