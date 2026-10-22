import { createHash } from "node:crypto";
import { z } from "zod";
import { artifactSetSchema, releaseIdentitySchema } from "../src/lib/release";
import { ConfigurationError } from "../src/lib/errors";

export const installationSchema = z
  .object({
    format: z.literal(1),
    project: z.string().regex(/^yinsen_[a-z0-9_]+$/),
    credentialFile: z.string().min(1),
    stateDirectory: z.string().min(1),
    backupDirectory: z.string().min(1),
  })
  .strict();

export const fileSchema = z
  .object({
    key: z
      .string()
      .regex(
        /^(messages|deliverables|branding)\/[a-f0-9-]{36}\/[a-f0-9-]{36}$/,
      ),
    driver: z.enum(["local", "s3"]),
    size: z.coerce.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export const snapshotSchema = z
  .object({
    format: z.literal(1),
    project: z.string(),
    createdAt: z.iso.datetime(),
    artifacts: artifactSetSchema,
    files: z.array(fileSchema),
    facts: z.record(z.string(), z.string()),
    projections: z.record(z.string(), z.array(z.string().min(1)).min(1)),
    inventory: z.array(
      z
        .object({
          path: z.string().min(1),
          size: z.number().int().nonnegative(),
          sha256: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict(),
    ),
    databaseSha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export type Artifacts = z.infer<typeof artifactSetSchema>;
export type FileReference = z.infer<typeof fileSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;

const journalBase = z.object({
  format: z.literal(1),
  previous: artifactSetSchema,
  checkpoint: z.string().nullable(),
});
export const operationJournalSchema = z.discriminatedUnion("phase", [
  journalBase
    .extend({
      phase: z.enum(["checkpoint", "migration", "retention", "backup"]),
    })
    .strict(),
  journalBase
    .extend({ phase: z.literal("restore"), localCopy: z.boolean() })
    .strict(),
  journalBase
    .extend({ phase: z.literal("activation"), target: artifactSetSchema })
    .strict(),
]);
export type OperationJournal = z.infer<typeof operationJournalSchema>;

export function sha256(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function assertPrefix(
  rows: { hash: string; created_at: string }[],
  identity: z.infer<typeof releaseIdentitySchema>,
): void {
  if (
    rows.length > identity.migrations.length ||
    rows.some(
      (row, index) =>
        row.hash !== identity.migrations[index]?.hash ||
        Number(row.created_at) !== identity.migrations[index]?.createdAt,
    )
  )
    throw new ConfigurationError(
      "Installed migration history is not a supported exact prefix. No update was started.",
    );
}

export function releaseDecision(
  current: Artifacts,
  candidate: Artifacts,
): "duplicate" | "update" {
  const oldSequence = current.identity.releaseSequence,
    newSequence = candidate.identity.releaseSequence;
  if (oldSequence === null || newSequence === null || newSequence < oldSequence)
    throw new ConfigurationError(
      "Older or unordered releases cannot replace this installation.",
    );
  if (newSequence === oldSequence) {
    if (JSON.stringify(current) !== JSON.stringify(candidate))
      throw new ConfigurationError(
        "This release sequence is already bound to different artifacts.",
      );
    return "duplicate";
  }
  if (
    candidate.identity.migrations.length < current.identity.migrations.length ||
    current.identity.migrations.some(
      (migration, index) =>
        JSON.stringify(migration) !==
        JSON.stringify(candidate.identity.migrations[index]),
    )
  )
    throw new ConfigurationError(
      "Release rewrites delivered migration history.",
    );
  return "update";
}
