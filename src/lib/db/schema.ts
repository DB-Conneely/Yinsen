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
  integer,
  date,
  primaryKey,
  uniqueIndex,
  bigserial,
  bigint,
  foreignKey,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import type { ProposalTerms } from "../messages/proposal-validators";

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

export const projects = pgTable(
  "projects",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    description: text().notNull().default(""),
    status: text()
      .$type<"draft" | "pending_lockin" | "active" | "paused">()
      .notNull()
      .default("draft"),
    budget: integer(),
    currency: text().notNull(),
    startDate: date("start_date"),
    dueDate: date("due_date"),
    proposalMessageId: uuid("proposal_message_id")
      .unique()
      .references((): AnyPgColumn => messages.id),
    proposalSnapshot: jsonb("proposal_snapshot").$type<ProposalTerms>(),
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
      "projects_status",
      sql`${table.status} in ('draft','pending_lockin','active','paused')`,
    ),
    check(
      "projects_budget",
      sql`${table.budget} is null or ${table.budget} >= 0`,
    ),
    check("projects_currency", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check(
      "projects_proposal_snapshot",
      sql`(${table.proposalMessageId} is null) = (${table.proposalSnapshot} is null)`,
    ),
    check(
      "projects_dates",
      sql`${table.startDate} is null or ${table.dueDate} is null or ${table.dueDate} >= ${table.startDate}`,
    ),
  ],
);

export const projectClients = pgTable(
  "project_clients",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    role: text().$type<"primary" | "member">().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.clientId] }),
    uniqueIndex("project_one_primary")
      .on(table.projectId)
      .where(sql`${table.role} = 'primary'`),
    check("project_client_role", sql`${table.role} in ('primary','member')`),
  ],
);

export const milestones = pgTable(
  "milestones",
  {
    id: uuid().primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    name: text().notNull(),
    description: text().notNull().default(""),
    status: text()
      .$type<"pending" | "in_progress" | "review" | "approved">()
      .notNull()
      .default("pending"),
    position: integer().notNull(),
    dueDate: date("due_date"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("milestones_project_position").on(table.projectId, table.position),
    check("milestones_position", sql`${table.position} >= 0`),
    check(
      "milestones_status",
      sql`${table.status} in ('pending','in_progress','review','approved')`,
    ),
  ],
);

export const projectActivity = pgTable(
  "project_activity",
  {
    id: uuid().primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    actorType: text("actor_type").$type<"operator" | "client">().notNull(),
    actorId: uuid("actor_id").notNull(),
    eventType: text("event_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("project_activity_created").on(table.projectId, table.createdAt),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid().primaryKey().defaultRandom(),
    position: bigserial({ mode: "number" }).notNull().unique(),
    clientId: uuid("client_id").references(() => clients.id),
    projectId: uuid("project_id").references(() => projects.id),
    senderType: text("sender_type").$type<"operator" | "client">().notNull(),
    senderId: uuid("sender_id").notNull(),
    body: text().notNull(),
    fingerprint: text().notNull(),
    type: text()
      .$type<"message" | "proposal" | "counter" | "accept" | "reject">()
      .notNull()
      .default("message"),
    chainId: uuid("chain_id").references((): AnyPgColumn => messages.id),
    replyTo: uuid("reply_to").references((): AnyPgColumn => messages.id),
    proposalData: jsonb("proposal_data").$type<ProposalTerms>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "message_one_conversation",
      sql`(${table.clientId} is null) <> (${table.projectId} is null)`,
    ),
    check(
      "message_sender_type",
      sql`${table.senderType} in ('operator','client')`,
    ),
    check("message_body_length", sql`length(${table.body}) <= 4000`),
    check(
      "message_proposal_shape",
      sql`(${table.type} = 'message' and ${table.chainId} is null and ${table.replyTo} is null and ${table.proposalData} is null) or (${table.clientId} is not null and ${table.chainId} is not null and ((${table.type} = 'proposal' and ${table.chainId} = ${table.id} and ${table.replyTo} is null and ${table.proposalData} is not null) or (${table.type} = 'counter' and ${table.replyTo} is not null and ${table.proposalData} is not null) or (${table.type} in ('accept','reject') and ${table.replyTo} is not null and ${table.proposalData} is null)))`,
    ),
    uniqueIndex("proposal_one_successor")
      .on(table.replyTo)
      .where(sql`${table.replyTo} is not null`),
    uniqueIndex("proposal_one_terminal")
      .on(table.chainId)
      .where(sql`${table.type} in ('accept','reject')`),
    index("messages_proposal_chain").on(table.chainId, table.position),
    index("messages_client_position").on(table.clientId, table.position),
    index("messages_project_position").on(table.projectId, table.position),
  ],
);

export const messageAttachments = pgTable(
  "message_attachments",
  {
    id: uuid().primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id),
    filename: text().notNull(),
    key: text("storage_key").notNull().unique(),
    driver: text().$type<"local" | "s3">().notNull(),
    size: bigint({ mode: "number" }).notNull(),
    mimeType: text("mime_type").notNull(),
    sha256: text().notNull(),
  },
  (table) => [
    index("message_attachments_message").on(table.messageId),
    check(
      "message_attachment_size",
      sql`${table.size} > 0 and ${table.size} <= 104857600`,
    ),
    check("message_attachment_driver", sql`${table.driver} in ('local','s3')`),
  ],
);

export const messageReads = pgTable(
  "message_reads",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id),
    actorId: uuid("actor_id").notNull(),
    actorType: text("actor_type").$type<"operator" | "client">().notNull(),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.messageId, table.actorId] }),
    check(
      "message_reader_type",
      sql`${table.actorType} in ('operator','client')`,
    ),
  ],
);

export const deliverables = pgTable(
  "deliverables",
  {
    id: uuid().primaryKey(),
    milestoneId: uuid("milestone_id")
      .notNull()
      .references(() => milestones.id, { onDelete: "cascade" }),
    parentDeliverableId: uuid("parent_deliverable_id"),
    version: integer().notNull(),
    filename: text().notNull(),
    key: text("storage_key").notNull().unique(),
    driver: text().$type<"local" | "s3">().notNull(),
    size: bigint({ mode: "number" }).notNull(),
    mimeType: text("mime_type").notNull(),
    sha256: text().notNull(),
    fingerprint: text().notNull(),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => operator.id),
    released: boolean().notNull().default(false),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("deliverables_id_milestone").on(table.id, table.milestoneId),
    foreignKey({
      columns: [table.parentDeliverableId, table.milestoneId],
      foreignColumns: [table.id, table.milestoneId],
      name: "deliverables_parent_milestone_fk",
    }),
    uniqueIndex("deliverables_chain_version").on(
      sql`coalesce(${table.parentDeliverableId},${table.id})`,
      table.version,
    ),
    index("deliverables_milestone").on(table.milestoneId),
    check(
      "deliverables_lineage",
      sql`(${table.parentDeliverableId} is null and ${table.version}=1) or (${table.parentDeliverableId} is not null and ${table.parentDeliverableId}<>${table.id} and ${table.version}>1)`,
    ),
    check(
      "deliverables_size",
      sql`${table.size}>0 and ${table.size}<=104857600`,
    ),
    check("deliverables_driver", sql`${table.driver} in ('local','s3')`),
  ],
);
