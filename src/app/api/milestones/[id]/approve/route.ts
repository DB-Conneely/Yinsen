import { apiResponse, readJson } from "../../../../../lib/http";
import { requestToken } from "../../../../../lib/auth/session";
import { projectActor } from "../../../../../lib/projects/access";
import { mutateMilestone } from "../../../../../lib/milestones/service";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return apiResponse(async () => {
    const data = await readJson(request);
    return mutateMilestone(
      (await context.params).id,
      data,
      await projectActor(requestToken(request)),
      "approve",
    );
  });
}
