import { apiResponse, readJson } from "../../../../lib/http";
import { requestToken } from "../../../../lib/auth/session";
import { projectActor } from "../../../../lib/projects/access";
import { mutateMilestone } from "../../../../lib/milestones/service";
type Context = { params: Promise<{ id: string }> };

export async function PATCH(
  request: Request,
  context: Context,
): Promise<Response> {
  return apiResponse(async () =>
    mutateMilestone(
      (await context.params).id,
      await readJson(request),
      await projectActor(requestToken(request)),
      "update",
    ),
  );
}
export async function DELETE(
  request: Request,
  context: Context,
): Promise<Response> {
  return apiResponse(async () => {
    await readJson(request);
    return mutateMilestone(
      (await context.params).id,
      {},
      await projectActor(requestToken(request)),
      "delete",
    );
  });
}
