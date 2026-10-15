# Project skills and agent loading

All required guidance is stored in this repository, without symlinks to a particular machine/plugin cache:

| Skill | Use |
| --- | --- |
| [GitHub workflow](../.agents/skills/github-workflow/SKILL.md) | Orchestrator-owned Git inspection, coherent local commits and conservative history/recovery. No remote-main update or deployment. |
| [Ponytail](../.agents/skills/ponytail/SKILL.md) | Smallest complete solution; no speculative abstractions; retain security, accessibility and functional proof. All engineering roles load it. |
| [Refresh context](../.agents/skills/refresh-context/SKILL.md) | Single-writer local Cortex narrative/dependency refresh plus separate Graphify code graph after structural changes or stale candidate snapshots. |
| [Graphify](../.agents/skills/graphify/SKILL.md) | Local caller/impact/ownership navigation. Actual source and functional proof remain authoritative. |

GitHub workflow is a preserved local skill copy. Ponytail retains its instructions and license, with its argument hint moved under supported metadata for the skill validator. Refresh-context is ported from the existing summary-project skill, removing dependencies on nonexistent dump/tree scripts and adding safe single-writer/code-only scope. Graphify's concise project skill follows the installed CLI's supported local commands. No global skill installation or user settings change is needed.

Repository skill discovery uses `.agents/skills/`; a new chat rooted in Yinsen can discover them. A pre-existing chat may need a reload/new turn. Root AGENTS and each role also explicitly require reading these paths, so discovery timing does not leave their instructions dormant. Project roles live as standalone TOML in `.codex/agents/`; if a current session has not loaded them, dispatch the available worker/default role with an explicit instruction to read the matching file. The main orchestrator reads its role itself.

No role file or skill is an OS permission sandbox. Audit report-only and patch ownership limits are task contracts; obey them even if tools permit broader edits. Models, reasoning, approval policy and account permissions inherit user settings; the repository does not override them.

Current official configuration references, checked 15 October 2026: [custom subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents), [skills](https://learn.chatgpt.com/docs/build-skills), [config reference](https://learn.chatgpt.com/docs/config-file/config-reference). The local configuration allows three concurrent subagents, covering each phase's X=3 audits/patches; Phase 5 uses X=2. An environment with fewer available slots must disclose that limitation and preserve one report/patch owner per task rather than pretending simultaneous execution.

## Context safety and proof

Generated Cortex and Graphify files are separate, ignored and source-bound. They never replace direct caller inspection, communication, installed wiring or functionality evidence. No automatic build loop, hooks, global cross-repo graph or billable semantic/model extraction is authorised. A graph tool's installation or successful help command proves only tooling availability.

There is no application source in the foundation. Do not run a fake extraction on the old repository or introduce sample application code merely to claim a map. Phase 1's actual source activates refresh; the handover records this distinction. Supplied secrets, databases, uploads and private evidence never enter a graph or source dump.
