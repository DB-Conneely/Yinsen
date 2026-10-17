import { apiResponse, readJson } from "../../../../../lib/http";
import {
  requestToken,
  requireOperatorToken,
} from "../../../../../lib/auth/session";
import {
  archiveClient,
  clientActivity,
  clientId,
} from "../../../../../lib/clients/service";
import {
  issueMagicLink,
  listClientSessions,
  revokeClientSession,
} from "../../../../../lib/auth/client";
import { AppError } from "../../../../../lib/errors";
import { z } from "zod";
type Context = { params: Promise<{ id: string; action: string }> };

export async function GET(
  request: Request,
  context: Context,
): Promise<Response> {
  return apiResponse(async () => {
    await requireOperatorToken(requestToken(request));
    const { id, action } = await context.params;
    if (action === "activity") return clientActivity(id);
    if (action === "sessions") return listClientSessions(id);
    throw new AppError(404, "NOT_FOUND", "Resource not found.");
  });
}
export async function POST(
  request: Request,
  context: Context,
): Promise<Response> {
  return apiResponse(async () => {
    const actor = await requireOperatorToken(requestToken(request));
    const input = await readJson(request);
    const { id, action } = await context.params;
    if (action === "restore") {
      z.object({}).strict().parse(input);
      return archiveClient(id, actor, true);
    }
    if (action === "generate-link") {
      z.object({}).strict().parse(input);
      const link = await issueMagicLink(id, actor);
      return { url: link.url, expiresInHours: 24 };
    }
    if (action === "sessions") {
      const data = z.object({ sessionId: clientId }).strict().parse(input);
      await revokeClientSession(id, data.sessionId, actor);
      return { revoked: true };
    }
    throw new AppError(404, "NOT_FOUND", "Resource not found.");
  });
}
