export async function register(): Promise<void> {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    const { readConfiguration } = await import("./lib/config");
    const { checkDatabase } = await import("./lib/db/health");
    const { logger } = await import("./lib/logger");
    readConfiguration();
    await checkDatabase();
    logger.info(
      { event: "startup.ready" },
      "Configuration and database schema verified",
    );
  }
}
