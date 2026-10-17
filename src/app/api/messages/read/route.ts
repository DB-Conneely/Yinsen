import { z } from "zod";
import { apiResponse, readJson } from "../../../../lib/http";
import { requestToken } from "../../../../lib/auth/session";
import { projectActor } from "../../../../lib/projects/access";
import { resourceId } from "../../../../lib/projects/validation";
import { markMessagesRead } from "../../../../lib/messages/service";
export async function POST(request: Request): Promise<Response> {
  return apiResponse(async () => {
    const actor = await projectActor(requestToken(request));
    const data = z
      .object({
        kind: z.enum(["client", "project"]),
        id: resourceId,
        ids: z.array(resourceId).max(50),
      })
      .strict()
      .parse(await readJson(request));
    return markMessagesRead(
      { kind: data.kind, id: data.id },
      { ids: data.ids },
      actor,
    );
  });
}
