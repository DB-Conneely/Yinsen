import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  pgTable,
  timestamp,
  text,
  uuid,
} from "drizzle-orm/pg-core";

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

export const operator = pgTable(
  "operator",
  {
    singleton: boolean()
      .primaryKey()
      .default(true)
      .references(() => installation.singleton),
    id: uuid().notNull().unique().defaultRandom(),
    name: text().notNull(),
    email: text().notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [check("operator_singleton", sql`${table.singleton} = true`)],
);

export const settings = pgTable(
  "settings",
  {
    singleton: boolean()
      .primaryKey()
      .default(true)
      .references(() => operator.singleton),
    brandName: text("brand_name").notNull(),
    brandColour: text("brand_colour").notNull().default("#2457A7"),
    defaultCurrency: text("default_currency").notNull().default("GBP"),
    welcomeText: text("welcome_text")
      .notNull()
      .default("Welcome to your client portal."),
  },
  (table) => [
    check("settings_singleton", sql`${table.singleton} = true`),
    check("settings_colour", sql`${table.brandColour} ~ '^#[0-9A-Fa-f]{6}$'`),
    check("settings_currency", sql`${table.defaultCurrency} ~ '^[A-Z]{3}$'`),
  ],
);

export const operatorSessions = pgTable("operator_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  operatorId: uuid("operator_id")
    .notNull()
    .references(() => operator.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
