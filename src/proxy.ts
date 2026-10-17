import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { logFailure } from "./lib/logger";
import {
  SESSION_COOKIE,
  sessionCookie,
  validateOperatorSession,
} from "./lib/auth/session";

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store");
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  // Page/API authorization remains in the server caller. This renews the browser's sliding cookie.
  try {
    if (token && (await validateOperatorSession(token)))
      response.headers.set("Set-Cookie", sessionCookie(token));
  } catch {
    // Continue to the server authorizer so its safe page recovery remains available.
    logFailure("SESSION_RENEWAL_FAILED", randomUUID());
  }
  return response;
}

export const config = { matcher: ["/dashboard/:path*", "/portal/:path*"] };
