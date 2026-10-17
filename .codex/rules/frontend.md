---
paths: ["src/app/**/*.tsx", "src/components/**", "src/hooks/**", "src/stores/**", "src/ui/**"]
---
# Frontend rules

- Render server-owned projects, proposals, milestones, invoices, release and sessions. Optimistic UI must not invent payment or approval success.
- Keep authorization on the server for pages, APIs, downloads and SSE. Hiding a button is not access control; protected data must not enter a shared cache.
- Use the selected actual session/cookie path, not another project's auth provider. Never expose database/provider/session secrets, unrestricted private-file URLs or another client's records to browser state/logs.
- Real actions reach real server callers and show confirmed outcomes or actionable failures. Match public URLs correctly; Next route-group names are not URL segments.
- Preserve semantic HTML, labels, focus, keyboard access and meaningful loading/empty/error states. Exercise actual operator/client responsive layouts.
- Treat screen composition and component styling as required delivered behaviour. Inspect real desktop/narrow viewports, both themes and scrolled states: navigation/header/sidebar placement, primary work versus secondary context, spacing, message/file/form hierarchy, readable status, contrast, focus and unobscured actions. Generic uncomposed panels or misplaced controls are defects. DOM presence and green interaction checks do not establish visual acceptance; full-page captures supplement actual viewport inspection and cannot prove sticky-element geometry. Orchestrator and QA must critically review the actual screens before completion.
- Reuse project/native controls before introducing dependencies or a speculative design system. Named exports except framework requirements.
- Client deliverables/versions require current project membership and release. Message attachments require current conversation access and no payment gate; operator permissions and public branding remain distinct.
- Brand/settings changes must reach actual views/emails/invoices. Do not hardcode Yinsen as the operator's brand or silently convert historical currency records.
