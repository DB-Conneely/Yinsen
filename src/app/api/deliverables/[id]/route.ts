import { apiResponse, readJson } from "../../../../lib/http";
import { requestToken } from "../../../../lib/auth/session";
import { projectActor } from "../../../../lib/projects/access";
import { releaseDeliverable } from "../../../../lib/deliverables/service";
type Context = { params: Promise<{ id: string }> };

export async function PATCH(
  request: Request,
  context: Context,
): Promise<Response> {
  return apiResponse(async () =>
    releaseDeliverable(
      (await context.params).id,
      await readJson(request),
      await projectActor(requestToken(request)),
    ),
  );
}
