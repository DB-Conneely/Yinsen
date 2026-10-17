import { apiResponse, readJson } from "../../../lib/http";
import { completeSetup, isSetupComplete } from "../../../lib/setup/service";
import { sessionCookie } from "../../../lib/auth/session";
import { checkDatabase } from "../../../lib/db/health";
import { AppError } from "../../../lib/errors";
import { readConfiguration } from "../../../lib/config";

export async function GET(): Promise<Response> {
  return apiResponse(async () => {
    if (await isSetupComplete())
      throw new AppError(409, "SETUP_COMPLETED", "Setup already completed.");
    await checkDatabase();
    return {
      database: "configured",
      email: readConfiguration().email ? "configured_unverified" : "skipped",
      payments: "skipped",
      storage: "skipped",
    };
  });
}

export async function POST(request: Request): Promise<Response> {
  let cookie: string | undefined;
  const response = await apiResponse(async () => {
    const result = await completeSetup(await readJson(request));
    cookie = sessionCookie(result.session.token);
    return result.user;
  });
  if (cookie) response.headers.set("Set-Cookie", cookie);
  return response;
}
