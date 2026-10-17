import { NextResponse, type NextRequest } from "next/server";
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
  if (token && (await validateOperatorSession(token)))
    response.headers.set("Set-Cookie", sessionCookie(token));
  return response;
}

export const config = { matcher: ["/dashboard/:path*"] };
