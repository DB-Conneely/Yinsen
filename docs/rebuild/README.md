# Yinsen locked rebuild foundation

Locked by Neels on 15 October 2026. Product scope, five phases/fourteen tasks and the amended delivery protocol are agreed. Product implementation has not started and Phase 1 has no execution authority in this setup turn. Functionality through proof > wired production code > tests/gates; all three are mandatory and unproven behaviour is never verified.

## Start here

| Document | Purpose |
| --- | --- |
| [Product contract](product-contract.md) | Self-hosted boundary, retained product, identity, payments, release and configuration decisions |
| [Delivery plan](delivery-plan.md) | Five sequential phases, fourteen directly assigned tasks, touchpoints, proof and original-step coverage |
| [Delivery process](delivery-process.md) | Sequential implementors, X parallel task audits, X communicating report-specific patchers, fresh repairing/verifying QA |
| [Engineering standards](engineering-standards.md) | BookedBy's engineering and functionality standards adapted to Yinsen's runtime |

Authority for rebuild work: Neels's instructions -> [root rules](../../AGENTS.md) -> product contract -> delivery plan -> delivery process/engineering standards and [mandatory rules](../../.codex/rules/) -> non-conflicting original product detail. Phase launch binds actual paths/prerequisites within this locked scope; it does not reopen the product routinely. Implementation still needs execution authorization. Read the [handover](../handover.md), [skills protocol](../skills.md) and assigned [role file](../../.codex/agents/).

## What changes, what carries forward

| Topic | Rebuild decision |
| --- | --- |
| Distribution | MIT open source; one independently owned self-hosted installation |
| Commercial option | Neels may charge for installation/configuration outside the product; no installation marketplace, checkout or entitlement logic |
| Actors | One operator account per installation plus client accounts; an agency can use one operator, without team-user management |
| Product | Preserve projects, lock-in, milestones, files/versions, messages/proposals, invoices, direct Stripe/manual settlement, completion/disputes, analytics, branding and settings |
| Identity/numbering | Installation-local client email uniqueness and atomic, immutable invoice numbers |
| Payments | Checkout on Pay, stable invoice correlation, full settlement, explicit late/duplicate outcomes |
| File release | Preserve the original any-linked-invoice-paid trigger; explain its exact limits in the product contract |
| Configuration | Server environment owns infrastructure/secrets; UI owns branding/business settings and verifies configured integrations |
| Workload | Phase -> Task; one fresh implementor per complete task, one supervisor per phase |
| Acceptance | Functional task proof; X parallel task audits and X coordinated patches at phase end; fresh write-capable QA alone verifies the integrated phase |

## Preserved sources

The [original product specification](../legacy/product.md) is copied unchanged. Its self-hosted domain rules, screens and APIs supply detail except where the new contract explicitly reconciles them. Managed SaaS, all-mode schema prescriptions and build-completion claims are historical, not active rebuild requirements.

The original Steps 1-36 are now [included locally](../legacy/implementation-original.md), with [provenance](../legacy/README.md). Their source can still be read without modifying the preserved original repository:

```sh
git -C /Users/sk3_neels/Desktop/client-portal show 75f2ab9a6ef1ebba8d3ac492e9280c8343907044:cortex-context/implementation.md
```

The [later implementation file](../legacy/implementation-hardening.md) contains remediation Steps 38-46, not that original plan. It and the [historical directive](../legacy/directive.md) are included as reference; original logs/history remain in the old repository. Rebuild tasks cover self-hosted Steps 1-28. Steps 29-36 and their scaffolding are outside active scope. Historical progress is not carried into completion.

The old baseline was `d78fbf9ef6d32f81db1a73758bae5a0f89d925d8`. Yinsen is a newly initialised independent repository and the agreed rebuild location; the old repository is not reset, renamed, stripped of ancestry or modified by this centralisation. No old application source, database or secrets are imported. Planning does not authorize legacy removal, data migration or an implementation salvage audit.

## Review basis and limits

Two fresh agents previously checked distribution/contracts and workload/workflow, discussed their recommendations and reviewed the fourteen-task product plan. That planning review is preserved below. Neels subsequently locked the plan and amended its audit/patch protocol as stated here; the new protocol supersedes the earlier two-auditor/two-patcher design.

This is a planning reconciliation, not an audit or certification of the old code. No existing application, provider or runtime was exercised. BookedBy's process and standards are the reference; its provider choices, historical evidence bulk and ten-phase calendar are not Yinsen requirements. No duration or model/reset budget is guaranteed by this plan.

## Planning review

15 October 2026 - both fresh reviewers completed their independent planning reviews and confirmed their corrections. The distribution reviewer checked retained product scope, self-hosted configuration, identity, payments/release and document authority. The execution reviewer checked original-step coverage, fourteen-task sequencing/dependencies, touchpoints, phase closure, standards and finite scope.

Two review findings were corrected and rechecked: download rules distinguish client deliverables, operator access, conversation-scoped attachments and public branding; test coverage explicitly includes every exported/public function in the delivered rebuild. Neither reviewer found a remaining planning blocker in that review's scope. Neels then locked the foundation and supplied the task-specific parallel audit/patch protocol. This is planning authority only, never a product QA verdict or implementation authorization.
