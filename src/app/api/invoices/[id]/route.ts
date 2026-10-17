import { apiResponse, readJson } from "../../../../lib/http";
import { requestToken } from "../../../../lib/auth/session";
import { projectActor } from "../../../../lib/projects/access";
import { getInvoice } from "../../../../lib/invoices/queries";
import { cancelInvoice, updateInvoice } from "../../../../lib/invoices/service";
type Context = { params: Promise<{ id: string }> };
export async function GET(
  request: Request,
  context: Context,
): Promise<Response> {
  return apiResponse(async () =>
    getInvoice(
      (await context.params).id,
      await projectActor(requestToken(request)),
    ),
  );
}
export async function PATCH(
  request: Request,
  context: Context,
): Promise<Response> {
  return apiResponse(async () =>
    updateInvoice(
      (await context.params).id,
      await readJson(request, 100000),
      await projectActor(requestToken(request)),
    ),
  );
}
export async function DELETE(
  request: Request,
  context: Context,
): Promise<Response> {
  return apiResponse(async () => {
    await readJson(request);
    return cancelInvoice(
      (await context.params).id,
      await projectActor(requestToken(request)),
      true,
    );
  });
}
