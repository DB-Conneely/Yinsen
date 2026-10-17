import { apiResponse, readJson } from "../../../lib/http";
import { requestToken, requireOperatorToken } from "../../../lib/auth/session";
import { listClients, saveClient } from "../../../lib/clients/service";

export async function GET(request: Request): Promise<Response> {
  return apiResponse(async () => {
    await requireOperatorToken(requestToken(request));
    return listClients(Object.fromEntries(new URL(request.url).searchParams));
  });
}
export async function POST(request: Request): Promise<Response> {
  return apiResponse(async () => {
    const actor = await requireOperatorToken(requestToken(request));
    return saveClient(await readJson(request), actor);
  });
}
