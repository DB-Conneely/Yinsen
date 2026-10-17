import { apiResponse, readJson } from "../../../../../lib/http";
import { requestToken } from "../../../../../lib/auth/session";
import { projectActor } from "../../../../../lib/projects/access";
import { transitionProject } from "../../../../../lib/projects/service";
import { AppError } from "../../../../../lib/errors";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return apiResponse(async () => {
    await readJson(request);
    const actor = await projectActor(requestToken(request));
    if (actor.role !== "client")
      throw new AppError(
        403,
        "FORBIDDEN",
        "A project member must confirm lock-in.",
      );
    return transitionProject(
      (await context.params).id,
      { status: "active" },
      actor,
    );
  });
}
