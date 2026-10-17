import { apiResponse, readJson } from "../../../../../lib/http";
import { requestToken } from "../../../../../lib/auth/session";
import { projectActor } from "../../../../../lib/projects/access";
import {
  sendInvoice,
  settleInvoice,
  cancelInvoice,
} from "../../../../../lib/invoices/service";
import { AppError } from "../../../../../lib/errors";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; action: string }> },
): Promise<Response> {
  return apiResponse(async () => {
    const { id, action } = await context.params;
    const data = await readJson(request);
    const actor = await projectActor(requestToken(request));
    if (action === "send") return sendInvoice(id, data, actor);
    if (action === "settle") return settleInvoice(id, data, actor);
    if (action === "cancel") return cancelInvoice(id, actor);
    throw new AppError(404, "NOT_FOUND", "Action not found.");
  });
}
