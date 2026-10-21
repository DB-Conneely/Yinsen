import { apiResponse, readJson } from "../../../../lib/http";
import { requestToken } from "../../../../lib/auth/session";
import {
  listOperatorSessions,
  revokeOperatorSessions,
} from "../../../../lib/auth/account";
export async function GET(request: Request): Promise<Response> {
  return apiResponse(() => listOperatorSessions(requestToken(request)));
}
export async function POST(request: Request): Promise<Response> {
  return apiResponse(async () =>
    revokeOperatorSessions(await readJson(request), requestToken(request)),
  );
}
