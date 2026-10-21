import { z } from "zod";

export const resourceId = z.uuid();
export const projectStatus = z.enum([
  "draft",
  "pending_lockin",
  "active",
  "paused",
  "pending_approval",
  "completed",
  "archived",
]);
const date = z.iso
  .date()
  .refine((value) => value >= "0001-01-01", "Use a year from 0001 to 9999.")
  .nullable();
export const reviewedVersion = z
  .object({ expectedRevision: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
export const completionDecision = reviewedVersion;
export const disputeDecision = reviewedVersion
  .extend({ reason: z.string().trim().min(10).max(4000) })
  .strict();
export const projectFields = z
  .object({
    name: z.string().trim().min(1).max(255),
    description: z.string().trim().max(4000).default(""),
    budget: z.number().int().min(0).max(2147483647).nullable().default(null),
    currency: z.string().regex(/^[A-Z]{3}$/),
    startDate: date.default(null),
    dueDate: date.default(null),
    clientIds: z
      .array(resourceId)
      .min(1)
      .max(50)
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Select each client once. The first client is primary.",
      ),
  })
  .strict();
export const projectPatch = projectFields
  .extend({
    description: projectFields.shape.description.removeDefault(),
    budget: projectFields.shape.budget.removeDefault(),
    startDate: date,
    dueDate: date,
  })
  .partial()
  .extend(reviewedVersion.shape);
export const milestoneFields = z
  .object({
    name: z.string().trim().min(1).max(255),
    description: z.string().trim().max(4000).default(""),
    dueDate: date.default(null),
  })
  .strict();
export const milestonePatch = milestoneFields
  .extend({
    description: milestoneFields.shape.description.removeDefault(),
    dueDate: date,
  })
  .partial();
export const milestoneStatus = z.enum([
  "pending",
  "in_progress",
  "review",
  "approved",
]);
