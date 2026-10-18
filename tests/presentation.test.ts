import { Children, createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DashboardNavigation } from "../src/components/dashboard-nav";
import { MilestoneFiles } from "../src/components/milestone-files";
import { InvoiceActions } from "../src/components/invoice-actions";
import { InvoiceForm } from "../src/components/invoice-form";
import type { InvoiceDetail } from "../src/lib/invoices/queries";
import OperatorInvoiceError from "../src/app/dashboard/invoices/error";
import ClientInvoiceError from "../src/app/portal/(protected)/invoices/error";

const route = vi.hoisted(() => ({ pathname: "/dashboard/clients" }));
const invoice: InvoiceDetail = {
  id: "00000000-0000-4000-8000-000000000001",
  clientId: "00000000-0000-4000-8000-000000000002",
  projectId: "00000000-0000-4000-8000-000000000003",
  number: "INV-001",
  status: "cancelled",
  currency: "GBP",
  amount: 10000,
  totalOverride: null,
  dueDate: null,
  notes: "",
  recipientName: "Recipient",
  recipientEmail: "client@example.test",
  issuerName: "Studio",
  issuerEmail: "studio@example.test",
  brandColour: "#2457a7",
  paymentInstructions: "Bank transfer",
  emailFailed: false,
  sentAt: null,
  paidAt: null,
  createdAt: "2026-10-17T00:00:00Z",
  settlementData: null,
  revision: "a".repeat(64),
  lineItems: [
    {
      description: "Design",
      quantityHundredths: 100,
      unitPrice: 10000,
      amount: 10000,
    },
  ],
  milestones: [
    { id: "00000000-0000-4000-8000-000000000004", name: "Design milestone" },
  ],
};
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("the installed shared workspace navigation", () => {
  it("uses the framework server-data retry callback on both invoice error pages", () => {
    for (const ErrorPage of [OperatorInvoiceError, ClientInvoiceError]) {
      const retry = vi.fn();
      const tree = createElement(ErrorPage, { retry });
      const rendered = ErrorPage(tree.props);
      expect(isValidElement<{ children: ReactNode }>(rendered)).toBe(true);
      if (!isValidElement<{ children: ReactNode }>(rendered))
        throw new TypeError("Expected the invoice error page.");
      for (const child of Children.toArray(rendered.props.children))
        if (
          isValidElement<{ onClick?: () => void }>(child) &&
          child.type === "button"
        )
          child.props.onClick?.();
      expect(retry).toHaveBeenCalledOnce();
    }
  });
  it("offers a client link only after the invoice was actually issued", () => {
    const portalUrl = "http://localhost:3051/portal/invoices/" + invoice.id;
    expect(
      renderToStaticMarkup(
        createElement(InvoiceActions, { invoice, email: false, portalUrl }),
      ),
    ).not.toContain("Client portal link");
    expect(
      renderToStaticMarkup(
        createElement(InvoiceActions, {
          invoice: { ...invoice, sentAt: "2026-10-17T00:00:00Z" },
          email: false,
          portalUrl,
        }),
      ),
    ).toContain("Client portal link");
  });
  it("renders the shared compact release checkbox and deterministic currency choices", () => {
    const runtime = vi
      .spyOn(Intl, "supportedValuesOf")
      .mockReturnValue(["GBP"]);
    try {
      const html = renderToStaticMarkup(
        createElement(InvoiceForm, {
          currency: "GBP",
          invoice: { ...invoice, status: "draft" },
          choices: {
            clients: [
              {
                id: invoice.clientId,
                name: "Recipient",
                email: invoice.recipientEmail,
              },
            ],
            projects: [
              {
                id: invoice.projectId ?? "",
                name: "Project",
                clientIds: [invoice.clientId],
              },
            ],
            milestones: [
              {
                ...invoice.milestones[0],
                id: "00000000-0000-4000-8000-000000000004",
                name: "Design milestone",
                projectId: invoice.projectId ?? "",
              },
            ],
          },
        }),
      );
      expect(html).toContain('class="checkbox"');
      expect(html).toContain("<option>SLE</option>");
      expect(html).toContain("any linked invoice");
    } finally {
      runtime.mockRestore();
    }
  });
  it("shows distinct same-name recipients with stable UUID values on new and edit forms", () => {
    const clients = [
      {
        id: invoice.clientId,
        name: "Same-name recipient",
        email: "first@example.test",
      },
      {
        id: "00000000-0000-4000-8000-000000000005",
        name: "Same-name recipient",
        email: "second@example.test",
      },
    ];
    for (const editing of [false, true]) {
      const html = renderToStaticMarkup(
        createElement(InvoiceForm, {
          currency: "GBP",
          choices: { clients, projects: [], milestones: [] },
          ...(editing ? { invoice: { ...invoice, status: "draft" } } : {}),
        }),
      );
      for (const client of clients)
        expect(html).toContain(
          `<option value="${client.id}"${editing && client.id === invoice.clientId ? ' selected=""' : ""}>${client.name} · ${client.email}</option>`,
        );
    }
  });
  it("keeps client management in the operator workspace and marks its actual route", () => {
    route.pathname = "/dashboard/clients/record";
    const html = renderToStaticMarkup(createElement(DashboardNavigation));
    expect(html).toMatch(
      /<a\b(?=[^>]*href="\/dashboard\/clients")(?=[^>]*aria-current="page")[^>]*>/,
    );
    expect(html).toContain('href="/dashboard/projects"');
    expect(html).not.toContain('href="/portal/messages"');
  });

  it("gives the client its real account, projects and active conversation without operator links", () => {
    route.pathname = "/portal/messages";
    const html = renderToStaticMarkup(
      createElement(DashboardNavigation, { role: "client" }),
    );
    expect(html).toContain('href="/portal"');
    expect(html).toContain('href="/portal/projects"');
    expect(html).toMatch(
      /<a\b(?=[^>]*href="\/portal\/messages")(?=[^>]*aria-current="page")[^>]*>/,
    );
    expect(html).not.toContain('href="/dashboard');
  });

  it("shows actual per-version status/history without offering locked client bytes", () => {
    const root = {
      id: "root",
      milestoneId: "milestone",
      parentDeliverableId: null,
      version: 1,
      filename: "Brand guide.txt",
      size: 45,
      released: true,
      uploadedAt: "2026-10-17T12:00:00Z",
    };
    const files = [
      root,
      {
        ...root,
        id: "next",
        parentDeliverableId: "root",
        version: 2,
        released: false,
      },
    ];
    const html = renderToStaticMarkup(
      createElement(MilestoneFiles, {
        milestoneId: "milestone",
        milestoneName: "Design",
        files,
        operator: false,
        maxBytes: 1048576,
      }),
    );
    expect(html).toContain("Version 2");
    expect(html).toContain("Previous versions (1)");
    expect(html).toContain('href="/api/deliverables/root/download"');
    expect(html).not.toContain('href="/api/deliverables/next/download"');
    expect(html).not.toContain("Upload file");
    const operator = renderToStaticMarkup(
      createElement(MilestoneFiles, {
        milestoneId: "milestone",
        milestoneName: "Design",
        files,
        operator: true,
        maxBytes: 1048576,
      }),
    );
    expect(operator).toContain("Upload file");
    expect(operator).toContain("Relock");
    expect(operator).toContain("Release");
    expect(operator).toContain('href="/api/deliverables/next/download"');
  });
  it("matches distinct same-name root choices to their file cards and preserves their UUID values", () => {
    const root = {
      id: "00000000-0000-4000-8000-000000000031",
      milestoneId: "milestone",
      parentDeliverableId: null,
      version: 1,
      filename: "same-name.txt",
      size: 45,
      released: false,
      uploadedAt: "2026-10-18T00:00:00Z",
    };
    const html = renderToStaticMarkup(
      createElement(MilestoneFiles, {
        milestoneId: "milestone",
        milestoneName: "Design",
        files: [
          root,
          { ...root, id: "00000000-0000-4000-8000-000000000032" },
          {
            ...root,
            id: "00000000-0000-4000-8000-000000000033",
            parentDeliverableId: root.id,
            version: 2,
            filename: "updated-name.txt",
          },
        ],
        operator: true,
        maxBytes: 1048576,
      }),
    );
    expect(html).toContain("<strong>File 1 · updated-name.txt</strong>");
    expect(html).toContain("<strong>File 2 · same-name.txt</strong>");
    expect(html).toContain(
      '<option value="00000000-0000-4000-8000-000000000031">File 1 · same-name.txt</option>',
    );
    expect(html).toContain(
      '<option value="00000000-0000-4000-8000-000000000032">File 2 · same-name.txt</option>',
    );
    expect(html).not.toContain(
      '<option value="00000000-0000-4000-8000-000000000033">',
    );
  });
});
