import { apiResponse, readJson } from "../../../../../lib/http";
import { requestToken } from "../../../../../lib/auth/session";
import { projectActor } from "../../../../../lib/projects/access";
import {
  sendInvoice,
  settleInvoice,
  cancelInvoice,
} from "../../../../../lib/invoices/service";
import { AppError } from "../../../../../lib/errors";
import {
  payInvoice,
  reconcileCheckout,
} from "../../../../../lib/stripe/checkout";
import { resolvePaymentException } from "../../../../../lib/stripe/queries";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; action: string }> },
): Promise<Response> {
  return apiResponse(async () => {
    const { id, action } = await context.params;
    const data = await readJson(request);
    const actor = await projectActor(requestToken(request));
    if (action === "pay") return payInvoice(id, actor);
    if (action === "reconcile") return reconcileCheckout(id, data, actor);
    if (action === "resolve-payment")
      return resolvePaymentException(id, data, actor);
    if (action === "send") return sendInvoice(id, data, actor);
    if (action === "settle") return settleInvoice(id, data, actor);
    if (action === "cancel") return cancelInvoice(id, actor);
    throw new AppError(404, "NOT_FOUND", "Action not found.");
  });
}
