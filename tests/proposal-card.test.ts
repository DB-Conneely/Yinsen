import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProposalCard } from "../src/components/proposal-card";
import type { Message } from "../src/lib/messages/queries";

const proposal: NonNullable<Message["proposal"]> = {
  chainId: "00000000-0000-4000-8000-000000000003",
  replyTo: null,
  latestId: "00000000-0000-4000-8000-000000000001",
  state: "pending",
  projectId: null,
  canRespond: true,
  terms: {
    name: "Identity",
    description: "A visual identity",
    budget: 10000,
    currency: "GBP",
    milestones: [],
  },
};
const message: Message = {
  id: "00000000-0000-4000-8000-000000000001",
  position: "1",
  body: "Proposed project: Identity",
  senderId: "00000000-0000-4000-8000-000000000002",
  senderType: "operator",
  senderName: "Alex",
  createdAt: "2026-10-21T12:00:00Z",
  read: true,
  attachments: [],
  type: "proposal",
  proposal,
};

function render(card: Message, operator = false): string {
  return renderToStaticMarkup(
    createElement(ProposalCard, {
      message: card,
      operator,
      submitAction: () => Promise.resolve({ messages: [], hasEarlier: false }),
      onSaved: () => undefined,
    }),
  );
}

describe("proposal actions follow current server authority", () => {
  it("offers response controls only to the current recipient", () => {
    const html = render(message);
    expect(html).toContain("awaiting your response");
    for (const label of ["Accept", "Counter", "Reject"])
      expect(html).toContain(`>${label}</button>`);
    expect(html).not.toContain("Open agreed project");
    const sender = render({
      ...message,
      proposal: { ...proposal, canRespond: false },
    });
    expect(sender).toContain("awaiting the other party");
    expect(sender).not.toContain("<button");
  });

  it("replaces obsolete terminal response controls with the exact agreed project link for either role", () => {
    const projectId = "00000000-0000-4000-8000-000000000004";
    for (const operator of [false, true]) {
      for (const type of ["proposal", "accept"] as const) {
        const html = render(
          {
            ...message,
            type,
            proposal: {
              ...proposal,
              state: "accepted",
              projectId,
              canRespond: false,
              terms: type === "accept" ? null : proposal.terms,
            },
          },
          operator,
        );
        expect(html).toContain('class="proposal-footer"');
        expect(html).toContain(
          `href="/${operator ? "dashboard" : "portal"}/projects/${projectId}"`,
        );
        expect(html.match(/Open agreed project/g)).toHaveLength(1);
        expect(html).not.toContain("<button");
      }
    }
  });

  it("keeps superseded and rejected terms readable without stale controls", () => {
    for (const state of ["pending", "rejected"] as const) {
      const html = render({
        ...message,
        proposal: {
          ...proposal,
          latestId: "00000000-0000-4000-8000-000000000005",
          state,
          canRespond: false,
        },
      });
      expect(html).toContain("superseded");
      expect(html).toContain("A visual identity");
      expect(html).not.toContain("<button");
      expect(html).not.toContain("Open agreed project");
    }
  });
});
