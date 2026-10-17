import { apiResponse } from "../../../../lib/http";
import { AppError } from "../../../../lib/errors";
import { handleStripeWebhook } from "../../../../lib/stripe/webhook";

export async function POST(request: Request): Promise<Response> {
  return apiResponse(async () => {
    const reader = request.body?.getReader();
    if (!reader)
      throw new AppError(400, "INVALID_BODY", "Webhook body is required.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > 1048576)
          throw new AppError(
            413,
            "PAYLOAD_TOO_LARGE",
            "Webhook body is too large.",
          );
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    return handleStripeWebhook(
      Buffer.concat(chunks).toString("utf8"),
      request.headers.get("stripe-signature") ?? "",
    );
  });
}
