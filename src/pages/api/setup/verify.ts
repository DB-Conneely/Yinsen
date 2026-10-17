import type { NextApiRequest, NextApiResponse } from "next";
import { Readable } from "node:stream";
import { z } from "zod";
import { apiResponse, readJson } from "../../../lib/http";
import { isSetupComplete } from "../../../lib/setup/service";
import { checkDatabase } from "../../../lib/db/health";
import { verifyEmail } from "../../../lib/email/resend";
import { consumeLoginAttempt } from "../../../lib/auth/rate-limit";
import { AppError } from "../../../lib/errors";

export const config = { api: { bodyParser: false } };
export default async function verifySetup(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  const response = await apiResponse(async () => {
    if (req.method !== "POST")
      throw new AppError(405, "METHOD_NOT_ALLOWED", "Use POST.");
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers))
      if (value !== undefined)
        headers.set(name, Array.isArray(value) ? value.join(",") : value);
    const request = new Request("http://localhost/api/setup/verify", {
      method: "POST",
      headers,
      // CAST: Node's Web stream implements fetch's body contract, requiring duplex.
      body: Readable.toWeb(req) as ReadableStream<Uint8Array>,
      duplex: "half",
    } as RequestInit & { duplex: string });
    z.object({})
      .strict()
      .parse(await readJson(request));
    if (await isSetupComplete())
      throw new AppError(409, "SETUP_COMPLETED", "Setup already completed.");
    consumeLoginAttempt(
      `setup-verify:${req.socket.remoteAddress ?? "unknown-peer"}`,
    );
    await checkDatabase();
    return {
      database: "configured",
      email: await verifyEmail(),
      payments: "skipped",
      storage: "skipped",
    };
  });
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.status(response.status).send(await response.text());
}
