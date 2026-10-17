import type { NextApiRequest, NextApiResponse } from "next";
import { Readable } from "node:stream";
import { z } from "zod";
import { apiResponse, readJson } from "../../../lib/http";
import { emailSchema } from "../../../lib/auth/validation";
import { consumeClientAttempt } from "../../../lib/auth/rate-limit";
import { requestMagicLink } from "../../../lib/auth/client";
import { AppError } from "../../../lib/errors";

export const config = { api: { bodyParser: false } };
export default async function magicLink(
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
    const request = new Request("http://localhost/api/auth/magic-link", {
      method: "POST",
      headers,
      // CAST: Node's Web stream implements fetch's body contract, requiring duplex.
      body: Readable.toWeb(req) as ReadableStream<Uint8Array>,
      duplex: "half",
    } as RequestInit & { duplex: string });
    const input = z
      .object({ email: emailSchema })
      .strict()
      .parse(await readJson(request));
    consumeClientAttempt(
      req.socket.remoteAddress ?? "unknown-peer",
      input.email,
    );
    return requestMagicLink(input);
  });
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.status(response.status).send(await response.text());
}
