import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  pgTable,
  timestamp,
  text,
  uuid,
  jsonb,
  index,
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

export const clients = pgTable(
  "clients",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    email: text().notNull().unique(),
    company: text().notNull().default(""),
    phone: text().notNull().default(""),
    notes: text().notNull().default(""),
    metadata: jsonb().$type<Record<string, string>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "clients_normalized_email",
      sql`${table.email} = lower(trim(${table.email}))`,
    ),
  ],
);

export const clientSessions = pgTable(
  "client_sessions",
  {
    id: uuid().primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull().unique(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("client_sessions_expiry").on(table.expiresAt)],
);

export const magicLinkTokens = pgTable(
  "magic_link_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (table) => [index("magic_link_tokens_expiry").on(table.expiresAt)],
);

export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    actorType: text("actor_type").$type<"operator" | "client">().notNull(),
    actorId: uuid("actor_id").notNull(),
    eventType: text("event_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("activity_client_created").on(table.clientId, table.createdAt),
  ],
);
