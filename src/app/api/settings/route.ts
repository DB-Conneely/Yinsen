import { apiResponse, readJson } from "../../../lib/http";
import { projectActor } from "../../../lib/projects/access";
import { requestToken } from "../../../lib/auth/session";
import { getOperatorSettings, saveSettings } from "../../../lib/settings";

export async function GET(request: Request): Promise<Response> {
  return apiResponse(async () =>
    getOperatorSettings(await projectActor(requestToken(request))),
  );
}
export async function PATCH(request: Request): Promise<Response> {
  return apiResponse(async () =>
    saveSettings(
      await readJson(request),
      await projectActor(requestToken(request)),
    ),
  );
}
