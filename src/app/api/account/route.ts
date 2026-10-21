import { apiResponse, readJson } from "../../../lib/http";
import { requestToken } from "../../../lib/auth/session";
import { saveAccount } from "../../../lib/auth/account";
export async function PATCH(request: Request): Promise<Response> {
  return apiResponse(async () =>
    saveAccount(await readJson(request), requestToken(request)),
  );
}
