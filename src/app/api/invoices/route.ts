import { apiResponse, readJson } from "../../../lib/http";
import { requestToken } from "../../../lib/auth/session";
import { projectActor } from "../../../lib/projects/access";
import { listInvoices } from "../../../lib/invoices/queries";
import { createInvoice } from "../../../lib/invoices/service";

export async function GET(request: Request): Promise<Response> {
  return apiResponse(async () =>
    listInvoices(
      await projectActor(requestToken(request)),
      Object.fromEntries(new URL(request.url).searchParams),
    ),
  );
}
export async function POST(request: Request): Promise<Response> {
  return apiResponse(async () =>
    createInvoice(
      await readJson(request, 100000),
      await projectActor(requestToken(request)),
    ),
  );
}
