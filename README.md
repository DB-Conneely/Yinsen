# Yinsen

Open-source, self-hosted client portal for freelancers and small agencies. Phase 1 resumed on Abyss on 17 October 2026, beginning with unfinished Task 1.1. An initial runnable foundation is committed; its latest startup/packaging changes still need final verification. Operator/client access follows in Tasks 1.2 and 1.3. Phase 1 remains unverified; see the [current handover](docs/handover.md).

Start with [AGENTS.md](AGENTS.md), the [planning index](docs/rebuild/README.md) and [current handover](docs/handover.md). The original client-portal repository remains intact; this is a fresh Git repository with its own history, not a copied implementation or rewritten ancestry.

## Locked delivery

Five phases, fourteen tasks: installation/access (3), projects/communication (3), files/invoices/payment (3), lifecycle/analytics/settings (3), distribution/recovery (2).

One phase orchestrator -> sequential implementor per task -> X parallel auditors, one per task -> X communicating patch agents, one per report -> fresh QA with repair authority and sole phase acceptance.

Verification priority: **functional proof > wired production code > tests and gates**. All three are required. Unproven behaviour is never VERIFIED.

## Repository map

- [Product contract](docs/rebuild/product-contract.md) and [delivery plan](docs/rebuild/delivery-plan.md)
- [Delivery process](docs/rebuild/delivery-process.md) and [engineering standards](docs/rebuild/engineering-standards.md)
- [Five agent roles](.codex/agents/) and [mandatory engineering/TypeScript rules](.codex/rules/)
- [Portable project skills](docs/skills.md), including GitHub workflow, Ponytail, Cortex refresh and Graphify
- [Preserved original plans and provenance](docs/legacy/README.md)

The product is MIT licensed. Installation/usage instructions will be delivered and exercised with the actual application; no legacy quickstart or completion claim is presented as working Yinsen software. Neels may charge for installation as a separate service without adding billing/platform logic to the portal.

## Run locally

Follow the [operator guide](docs/operator.md) for Docker Compose, configuration, explicit migrations and source development. The foundation uses Next.js 16.4.2, React 19.3.1, Node.js 22 and PostgreSQL 16.13 with Drizzle. The [engineering gates](docs/as-built/engineering-gates.md) map strict TypeScript, type-aware lint, tests and production build to real commands.

One application process and one persisted PostgreSQL database form the supported foundation. No external provider is needed to start it. See the [current as-built](docs/as-built/system.md) for exact delivered scope and observed proof; a healthy infrastructure response does not establish portal business functionality.

Neels performs deployment manually through GitHub CI/CD. No agent pushes or deploys this project.
