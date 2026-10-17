export async function register(): Promise<void> {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    const { readConfiguration } = await import("./lib/config");
    const { checkDatabase } = await import("./lib/db/health");
    const { logger } = await import("./lib/logger");
    const { AppError } = await import("./lib/errors");
    const { startAccessCleanup } = await import("./lib/cleanup");
    try {
      readConfiguration();
      await checkDatabase();
      await startAccessCleanup();
      logger.info(
        { event: "startup.ready" },
        "Configuration and database schema verified",
      );
    } catch (error: unknown) {
      logger.fatal(
        { code: error instanceof AppError ? error.code : "STARTUP_FAILED" },
        "Startup refused. Check configuration, database service and migration status.",
      );
      process.exit(1);
    }
  }
}
