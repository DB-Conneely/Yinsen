import { apiResponse, readJson } from "../../../../lib/http";
import {
  requestToken,
  requireOperatorToken,
} from "../../../../lib/auth/session";
import {
  getClient,
  saveClient,
  archiveClient,
} from "../../../../lib/clients/service";
type Context = { params: Promise<{ id: string }> };

export async function GET(
  request: Request,
  context: Context,
): Promise<Response> {
  return apiResponse(async () => {
    await requireOperatorToken(requestToken(request));
    return getClient((await context.params).id);
  });
}
export async function PATCH(
  request: Request,
  context: Context,
): Promise<Response> {
  return apiResponse(async () => {
    const actor = await requireOperatorToken(requestToken(request));
    return saveClient(
      await readJson(request),
      actor,
      (await context.params).id,
    );
  });
}
export async function DELETE(
  request: Request,
  context: Context,
): Promise<Response> {
  return apiResponse(async () => {
    const actor = await requireOperatorToken(requestToken(request));
    await readJson(request);
    return archiveClient((await context.params).id, actor, false);
  });
}
