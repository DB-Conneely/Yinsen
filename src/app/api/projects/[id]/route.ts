import { apiResponse, readJson } from "../../../../lib/http";
import { requestToken } from "../../../../lib/auth/session";
import { projectActor, operatorOnly } from "../../../../lib/projects/access";
import { getProject } from "../../../../lib/projects/queries";
import {
  saveProject,
  transitionProject,
  deleteProject,
} from "../../../../lib/projects/service";
import { z } from "zod";
type Context = { params: Promise<{ id: string }> };

export async function GET(
  request: Request,
  context: Context,
): Promise<Response> {
  return apiResponse(async () =>
    getProject(
      (await context.params).id,
      await projectActor(requestToken(request)),
    ),
  );
}
export async function PATCH(
  request: Request,
  context: Context,
): Promise<Response> {
  return apiResponse(async () => {
    const actor = await projectActor(requestToken(request));
    operatorOnly(actor);
    const data = await readJson(request);
    const status = z.object({ status: z.string() }).strict().safeParse(data);
    const id = (await context.params).id;
    return status.success
      ? transitionProject(id, data, actor)
      : saveProject(data, actor, id);
  });
}
export async function DELETE(
  request: Request,
  context: Context,
): Promise<Response> {
  return apiResponse(async () => {
    await readJson(request);
    return deleteProject(
      (await context.params).id,
      await projectActor(requestToken(request)),
    );
  });
}
