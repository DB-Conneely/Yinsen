import { z } from "zod";
import { milestoneFields, resourceId } from "../projects/validation";

export const proposalTerms = z
  .object({
    name: z.string().trim().min(1).max(255),
    description: z.string().trim().max(4000),
    budget: z.number().int().min(0).max(2147483647),
    currency: z.string().regex(/^[A-Z]{3}$/),
    milestones: z.array(milestoneFields).max(200),
  })
  .strict();
export type ProposalTerms = z.infer<typeof proposalTerms>;

export const proposalAction = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("proposal"),
      requestId: resourceId,
      terms: proposalTerms,
    })
    .strict(),
  z
    .object({
      type: z.literal("counter"),
      requestId: resourceId,
      proposalId: resourceId,
      terms: proposalTerms,
    })
    .strict(),
  z
    .object({
      type: z.enum(["accept", "reject"]),
      requestId: resourceId,
      proposalId: resourceId,
    })
    .strict(),
]);
export type ProposalAction = z.infer<typeof proposalAction>;

export const proposalView = z.object({
  chainId: resourceId,
  replyTo: resourceId.nullable(),
  terms: proposalTerms.nullable(),
  latestId: resourceId,
  state: z.enum(["pending", "accepted", "rejected"]),
  projectId: resourceId.nullable(),
  canRespond: z.boolean(),
});
export type ProposalView = z.infer<typeof proposalView>;
