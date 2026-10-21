import { publicLogo } from "../../../../../lib/branding-logo";
import { apiResponse } from "../../../../../lib/http";
import { DatabaseError } from "../../../../../lib/errors";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    return await publicLogo((await context.params).id);
  } catch (error: unknown) {
    return apiResponse(() =>
      Promise.reject(error instanceof Error ? error : new DatabaseError()),
    );
  }
}
