import { apiResponse } from "../../../../../../../lib/http";
import { requestToken } from "../../../../../../../lib/auth/session";
import { projectActor } from "../../../../../../../lib/projects/access";
import { downloadAttachment } from "../../../../../../../lib/messages/service";
type Context = { params: Promise<{ id: string; attachmentId: string }> };
export async function GET(
  request: Request,
  context: Context,
): Promise<Response> {
  try {
    const { id, attachmentId } = await context.params;
    return await downloadAttachment(
      id,
      attachmentId,
      await projectActor(requestToken(request)),
    );
  } catch (error: unknown) {
    return apiResponse(() => {
      throw error;
    });
  }
}
