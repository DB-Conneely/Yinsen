import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { z } from "zod";
import { version } from "../../package.json";

export const releaseIdentitySchema = z
  .object({
    format: z.literal(1),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    sourceRevision: z
      .string()
      .regex(/^[a-f0-9]{40}$/)
      .nullable(),
    sourceDirty: z.boolean(),
    releaseSequence: z.number().int().positive().nullable(),
    migrationDigest: z.string().regex(/^[a-f0-9]{64}$/),
    migrations: z
      .array(
        z
          .object({
            name: z.string(),
            hash: z.string().regex(/^[a-f0-9]{64}$/),
            createdAt: z.number().int(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .refine(
    (identity) =>
      identity.migrationDigest ===
      createHash("sha256")
        .update(JSON.stringify(identity.migrations))
        .digest("hex"),
    "Migration history digest mismatch.",
  );

const imageSchema = z
  .object({
    image: z
      .string()
      .regex(
        /^(?:sha256:[a-f0-9]{64}|[a-z0-9][a-z0-9./:_-]*@sha256:[a-f0-9]{64})$/,
      ),
    id: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict()
  .refine(
    (artifact) =>
      !artifact.image.startsWith("sha256:") || artifact.image === artifact.id,
    "Local image ID mismatch.",
  );

export const artifactSetSchema = z
  .object({
    format: z.literal(1),
    identity: releaseIdentitySchema,
    runtime: imageSchema,
    tools: imageSchema,
  })
  .strict()
  .refine(
    (artifacts) =>
      !artifacts.identity.sourceDirty &&
      artifacts.identity.sourceRevision !== null &&
      artifacts.identity.releaseSequence !== null,
    "Artifacts require committed ordered release identity.",
  );

export function migrationIdentity(): Pick<
  z.infer<typeof releaseIdentitySchema>,
  "migrations" | "migrationDigest"
> {
  const migrations = readMigrationFiles({ migrationsFolder: "drizzle" }).map(
    (file, index) => ({
      name: String(index).padStart(4, "0"),
      hash: file.hash,
      createdAt: file.folderMillis,
    }),
  );
  return {
    migrations,
    migrationDigest: createHash("sha256")
      .update(JSON.stringify(migrations))
      .digest("hex"),
  };
}

export function readReleaseIdentity(): z.infer<typeof releaseIdentitySchema> {
  if (existsSync("release.json"))
    return releaseIdentitySchema.parse(
      JSON.parse(readFileSync("release.json", "utf8")),
    );
  return {
    format: 1,
    version,
    sourceRevision: null,
    sourceDirty: true,
    releaseSequence: null,
    ...migrationIdentity(),
  };
}
