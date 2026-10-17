import {
  getMessagesResponse,
  sendMessageResponse,
} from "../../../../../lib/messages/http";
type Context = { params: Promise<{ id: string }> };
export async function GET(
  request: Request,
  context: Context,
): Promise<Response> {
  return getMessagesResponse(request, {
    kind: "project",
    id: (await context.params).id,
  });
}
export async function POST(
  request: Request,
  context: Context,
): Promise<Response> {
  return sendMessageResponse(request, {
    kind: "project",
    id: (await context.params).id,
  });
}
