import { projectStream } from "../../../lib/events/stream";
import { apiResponse } from "../../../lib/http";
import { resourceId } from "../../../lib/projects/validation";

export async function GET(request: Request): Promise<Response> {
  try {
    const id = new URL(request.url).searchParams.get("projectId");
    const client = new URL(request.url).searchParams.get("clientId");
    if (id && client)
      throw new (await import("../../../lib/errors")).AppError(
        400,
        "VALIDATION_ERROR",
        "Choose one conversation.",
      );
    return await projectStream(
      request,
      id ? resourceId.parse(id) : undefined,
      client ? resourceId.parse(client) : undefined,
    );
  } catch (error: unknown) {
    return apiResponse(() => {
      throw error;
    });
  }
}
