import { apiResponse, readJson } from "../../../lib/http";
import { requestToken } from "../../../lib/auth/session";
import { projectActor } from "../../../lib/projects/access";
import { listProjects } from "../../../lib/projects/queries";
import { saveProject } from "../../../lib/projects/service";

export async function GET(request: Request): Promise<Response> {
  return apiResponse(async () =>
    listProjects(await projectActor(requestToken(request))),
  );
}
export async function POST(request: Request): Promise<Response> {
  return apiResponse(async () =>
    saveProject(
      await readJson(request),
      await projectActor(requestToken(request)),
    ),
  );
}
