import { apiResponse } from "../../../../../lib/http";
import { requestToken } from "../../../../../lib/auth/session";
import { projectActor } from "../../../../../lib/projects/access";
import { downloadDeliverable } from "../../../../../lib/deliverables/service";
type Context = { params: Promise<{ id: string }> };

export async function GET(
  request: Request,
  context: Context,
): Promise<Response> {
  try {
    return await downloadDeliverable(
      (await context.params).id,
      await projectActor(requestToken(request)),
    );
  } catch (error: unknown) {
    return apiResponse(() => {
      throw error;
    });
  }
}
