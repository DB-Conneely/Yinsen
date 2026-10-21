import { requestToken } from "../../../../lib/auth/session";
import { projectActor } from "../../../../lib/projects/access";
import { apiResponse } from "../../../../lib/http";
import { readAnalytics } from "../../../../lib/analytics/queries";

export async function GET(request: Request): Promise<Response> {
  return apiResponse(async () => {
    const actor = await projectActor(requestToken(request));
    const snapshot = await readAnalytics(
      actor,
      new URL(request.url).searchParams.get("period") ?? undefined,
    );
    return { window: snapshot.window, ...snapshot.revenue };
  });
}
