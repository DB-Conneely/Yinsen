import { projectStream } from "../../../lib/events/stream";
import { apiResponse } from "../../../lib/http";
import { resourceId } from "../../../lib/projects/validation";

export async function GET(request: Request): Promise<Response> {
  try {
    const id = new URL(request.url).searchParams.get("projectId");
    return await projectStream(request, id ? resourceId.parse(id) : undefined);
  } catch (error: unknown) {
    return apiResponse(() => {
      throw error;
    });
  }
}
