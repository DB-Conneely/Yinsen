import type { NextApiRequest, NextApiResponse } from "next";
import { Readable } from "node:stream";
import { apiResponse, readJson } from "../../../lib/http";
import { loginOperator } from "../../../lib/auth/login";
import { consumeLoginAttempt } from "../../../lib/auth/rate-limit";
import { sessionCookie } from "../../../lib/auth/session";
import { AppError } from "../../../lib/errors";

export const config = { api: { bodyParser: false } };

// The Node adapter is intentional: Route Handlers do not expose the TCP peer.
export default async function login(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  let cookie: string | undefined;
  const response = await apiResponse(async () => {
    if (req.method !== "POST")
      throw new AppError(405, "METHOD_NOT_ALLOWED", "Use POST.");
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (value !== undefined)
        headers.set(name, Array.isArray(value) ? value.join(",") : value);
    }
    const request = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers,
      // CAST: Node's Web stream implements the fetch body contract; duplex is required by Node fetch.
      body: Readable.toWeb(req) as ReadableStream<Uint8Array>,
      duplex: "half",
    } as RequestInit & { duplex: string });
    const input = await readJson(request);
    consumeLoginAttempt(req.socket.remoteAddress ?? "unknown-peer");
    const result = await loginOperator(input);
    cookie = sessionCookie(result.session.token);
    return result.user;
  });
  response.headers.forEach((value, key) => res.setHeader(key, value));
  if (cookie) res.setHeader("Set-Cookie", cookie);
  res.status(response.status).send(await response.text());
}
