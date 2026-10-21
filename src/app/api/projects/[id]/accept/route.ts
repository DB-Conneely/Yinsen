import { apiResponse, readJson } from "../../../../../lib/http";
import { requestToken } from "../../../../../lib/auth/session";
import { projectActor } from "../../../../../lib/projects/access";
import { AppError } from "../../../../../lib/errors";
import { transitionProject } from "../../../../../lib/projects/service";
import { completionDecision } from "../../../../../lib/projects/validation";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return apiResponse(async () => {
    const actor = await projectActor(requestToken(request));
    if (actor.role !== "client")
      throw new AppError(
        403,
        "FORBIDDEN",
        "Only the primary client can accept completion.",
      );
    const data = completionDecision.parse(await readJson(request));
    return transitionProject(
      (await context.params).id,
      { status: "completed", ...data },
      actor,
    );
  });
}
