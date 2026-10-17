import { apiResponse } from "../http";
import { projectActor } from "../projects/access";
import { requestToken } from "../auth/session";
import { conversationAccess, type Conversation } from "./access";
import { listMessages } from "./queries";
import { readMessageUpload } from "../storage/upload";
import { sendMessage } from "./service";

export async function getMessagesResponse(
  request: Request,
  conversation: Conversation,
): Promise<Response> {
  return apiResponse(async () =>
    listMessages(
      conversation,
      await projectActor(requestToken(request)),
      Object.fromEntries(new URL(request.url).searchParams),
    ),
  );
}

export async function sendMessageResponse(
  request: Request,
  conversation: Conversation,
): Promise<Response> {
  return apiResponse(async () => {
    await conversationAccess(
      conversation,
      await projectActor(requestToken(request)),
    );
    const upload = await readMessageUpload(request);
    try {
      // Upload time must not preserve an expired or revoked session.
      return await sendMessage(
        conversation,
        upload,
        await projectActor(requestToken(request)),
      );
    } finally {
      await upload.cleanup();
    }
  });
}
