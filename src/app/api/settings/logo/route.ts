import { apiResponse, readJson } from "../../../../lib/http";
import {
  requireOperatorToken,
  requestToken,
} from "../../../../lib/auth/session";
import { readLogoUpload } from "../../../../lib/storage/upload";
import { saveLogo } from "../../../../lib/branding-logo";
import { removeLogo } from "../../../../lib/settings";
import { z } from "zod";

export async function POST(request: Request): Promise<Response> {
  return apiResponse(async () => {
    await requireOperatorToken(requestToken(request));
    const upload = await readLogoUpload(request);
    try {
      return await saveLogo(
        upload,
        await requireOperatorToken(requestToken(request)),
      );
    } finally {
      await upload.cleanup();
    }
  });
}
export async function DELETE(request: Request): Promise<Response> {
  return apiResponse(async () => {
    z.object({})
      .strict()
      .parse(await readJson(request));
    return removeLogo(await requireOperatorToken(requestToken(request)));
  });
}
