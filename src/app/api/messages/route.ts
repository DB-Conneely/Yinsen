import { apiResponse } from "../../../lib/http";
import { requestToken } from "../../../lib/auth/session";
import { projectActor } from "../../../lib/projects/access";
import { messageSummary } from "../../../lib/messages/queries";
export async function GET(request: Request): Promise<Response> {
  return apiResponse(async () =>
    messageSummary(await projectActor(requestToken(request))),
  );
}
