import { apiResponse, readJson } from "../../../../lib/http";
import { requestToken } from "../../../../lib/auth/session";
import { projectActor } from "../../../../lib/projects/access";
import { saveInvoiceDefaults } from "../../../../lib/invoices/service";
export async function PATCH(request: Request): Promise<Response> {
  return apiResponse(async () =>
    saveInvoiceDefaults(
      await readJson(request),
      await projectActor(requestToken(request)),
    ),
  );
}
