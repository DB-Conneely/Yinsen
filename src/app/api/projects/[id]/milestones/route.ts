import { apiResponse, readJson } from "../../../../../lib/http";
import { requestToken } from "../../../../../lib/auth/session";
import { projectActor } from "../../../../../lib/projects/access";
import { getProject } from "../../../../../lib/projects/queries";
import { createMilestone } from "../../../../../lib/milestones/service";
type Context = { params: Promise<{ id: string }> };

export async function GET(
  request: Request,
  context: Context,
): Promise<Response> {
  return apiResponse(
    async () =>
      (
        await getProject(
          (await context.params).id,
          await projectActor(requestToken(request)),
        )
      ).milestones,
  );
}
export async function POST(
  request: Request,
  context: Context,
): Promise<Response> {
  return apiResponse(async () =>
    createMilestone(
      (await context.params).id,
      await readJson(request),
      await projectActor(requestToken(request)),
    ),
  );
}
