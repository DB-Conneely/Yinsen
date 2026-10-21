import { apiResponse, readJson } from "../../../../../lib/http";
import { requestToken } from "../../../../../lib/auth/session";
import { operatorOnly, projectActor } from "../../../../../lib/projects/access";
import { transitionProject } from "../../../../../lib/projects/service";
import { completionDecision } from "../../../../../lib/projects/validation";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return apiResponse(async () => {
    const actor = await projectActor(requestToken(request));
    operatorOnly(actor);
    const data = completionDecision.parse(await readJson(request));
    return transitionProject(
      (await context.params).id,
      { status: "archived", ...data },
      actor,
    );
  });
}
