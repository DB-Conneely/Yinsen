import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProjectActions } from "../src/components/project-actions";
import type { ProjectDetail } from "../src/lib/projects/queries";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
const project: ProjectDetail = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Shared project",
  description: "Scope",
  status: "active",
  budget: 12000,
  currency: "GBP",
  startDate: null,
  dueDate: null,
  updatedAt: "2026-10-21T00:00:00Z",
  editRevision: "a".repeat(64),
  lockRevision: "b".repeat(64),
  completionRevision: "c".repeat(64),
  members: [],
  milestones: [],
  activity: [],
};
function render(
  status: ProjectDetail["status"],
  operator: boolean,
  primary = false,
): string {
  return renderToStaticMarkup(
    createElement(ProjectActions, {
      project: { ...project, status },
      operator,
      primary,
    }),
  );
}
describe("consumed lifecycle controls", () => {
  it("offers the operator the actual next transition and preserves history management", () => {
    expect(render("active", true)).toContain("Submit for completion");
    expect(render("pending_approval", true)).toContain(
      "Waiting for the primary client",
    );
    expect(render("pending_approval", true)).not.toContain(
      ">Accept completion<",
    );
    expect(render("completed", true)).toContain("Archive project");
    expect(render("archived", true)).toContain("Project archived");
    expect(render("archived", true)).not.toContain(">Archive project<");
    expect(render("archived", true)).toContain("Edit project and members");
  });
  it("limits completion decisions to the primary client and keeps members informed", () => {
    expect(render("pending_approval", false, true)).toContain(
      "Accept completion",
    );
    expect(render("pending_approval", false, true)).toContain(
      "Request changes",
    );
    expect(render("pending_approval", false)).not.toContain(
      ">Accept completion<",
    );
    expect(render("pending_approval", false)).toContain(
      "The primary client reviews completion",
    );
    expect(render("archived", false, true)).not.toContain("Delete project");
  });
});
