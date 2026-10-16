import { sql } from "drizzle-orm";
import { boolean, check, pgTable, timestamp } from "drizzle-orm/pg-core";

export const installation = pgTable(
  "installation",
  {
    singleton: boolean().primaryKey().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [check("installation_singleton", sql`${table.singleton} = true`)],
);
