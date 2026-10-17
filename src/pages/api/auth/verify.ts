import type { NextApiRequest, NextApiResponse } from "next";
import { Readable } from "node:stream";
import { apiResponse, readJson } from "../../../lib/http";
import { redeemMagicLink } from "../../../lib/auth/client";
import { sessionCookie } from "../../../lib/auth/session";
import { consumeClientAttempt } from "../../../lib/auth/rate-limit";
import { AppError } from "../../../lib/errors";

export const config = { api: { bodyParser: false } };
export default async function verify(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  let cookie: string | undefined;
  const response = await apiResponse(async () => {
    if (req.method !== "POST")
      throw new AppError(405, "METHOD_NOT_ALLOWED", "Use POST.");
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers))
      if (value !== undefined)
        headers.set(name, Array.isArray(value) ? value.join(",") : value);
    const request = new Request("http://localhost/api/auth/verify", {
      method: "POST",
      headers,
      // CAST: Node's Web stream implements fetch's body contract, requiring duplex.
      body: Readable.toWeb(req) as ReadableStream<Uint8Array>,
      duplex: "half",
    } as RequestInit & { duplex: string });
    const input = await readJson(request);
    consumeClientAttempt(
      `verify:${req.socket.remoteAddress ?? "unknown-peer"}`,
    );
    const session = await redeemMagicLink(input);
    cookie = sessionCookie(session.token);
    return { authenticated: true };
  });
  response.headers.forEach((value, key) => res.setHeader(key, value));
  if (cookie) res.setHeader("Set-Cookie", cookie);
  res.status(response.status).send(await response.text());
}
