export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string) {
    super(500, "CONFIGURATION_ERROR", message);
  }
}

export class DatabaseError extends AppError {
  constructor() {
    super(
      503,
      "DATABASE_UNAVAILABLE",
      "Database unavailable. Check the database service and migration status.",
    );
  }
}

export class SchemaError extends AppError {
  constructor() {
    super(
      503,
      "SCHEMA_MISMATCH",
      "Database schema does not match this application. Run npm run db:status and npm run db:migrate before starting.",
    );
  }
}
