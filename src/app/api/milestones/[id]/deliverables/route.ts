import { apiResponse } from "../../../../../lib/http";
import { requestToken } from "../../../../../lib/auth/session";
import {
  projectActor,
  operatorOnly,
  projectAccess,
} from "../../../../../lib/projects/access";
import { readDeliverableUpload } from "../../../../../lib/storage/upload";
import { uploadDeliverable } from "../../../../../lib/deliverables/service";
import { milestoneProject } from "../../../../../lib/deliverables/queries";
type Context = { params: Promise<{ id: string }> };

export async function POST(
  request: Request,
  context: Context,
): Promise<Response> {
  return apiResponse(async () => {
    const actor = await projectActor(requestToken(request));
    operatorOnly(actor);
    const { id } = await context.params;
    await projectAccess(await milestoneProject(id), actor);
    const upload = await readDeliverableUpload(request);
    try {
      return await uploadDeliverable(
        id,
        upload,
        await projectActor(requestToken(request)),
      );
    } finally {
      await upload.cleanup();
    }
  });
}
