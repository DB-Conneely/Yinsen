---
name: github-workflow
description: Use for coding work in any Git repository to manage branches, worktrees, commits, local merges, and PRs while keeping remote main and deployment under user control.
---

# GitHub workflow

Apply this workflow across repositories when implementing code. Respect any stricter repository rules and the user's instructions.

- Inspect the working tree, index, current branch, relevant refs and history, remotes, stashes, and worktrees before Git mutations. Preserve existing user work and recovery paths. Never mix unrelated changes into a commit.
- Use the primary checkout by default. Create a worktree only for known simultaneous collaboration that needs isolated checkouts, or when the user explicitly requests one. Sequential agents share the primary checkout; delegation alone does not justify a worktree.
- When a branch is needed, use one `codex/` branch per coherent, reviewable change in the primary checkout. Follow the user's chosen branch, including local `main`; do not create a branch for every plan step.
- Commit small, coherent increments frequently after their focused checks. Do not wait for an entire phase, all agents or final broad gates to accumulate one large batch commit. Label an explicitly authorized incomplete checkpoint honestly; committing or merging it does not establish acceptance. Keep dependent increments together and preserve existing history.
- Use the repository's configured user identity for commits. Never credit the assistant or any AI as author, committer, or co-author; never add AI attribution to commit messages or PRs. If the user identity is missing or unclear, ask before committing.
- Successful verified work is not complete while it remains only on a feature branch. Merge it into **local `main`** as the default final handoff after inspecting local and remote branch state. Preserve unrelated dirty work and concurrent changes; include them only when explicitly authorized. Leave incomplete or failing work unmerged unless the user explicitly requests a checkpoint merge, and retain its unresolved status. A no-push or no-deploy instruction does not prohibit local commits and a local merge.
- If Git reports a merge conflict, stop. Review both sides and the relevant history, explain what caused the conflict, and recommend a concrete resolution. Do not choose a side, force a merge, discard changes, or continue until the user agrees on the resolution.
- **Never push to GitHub's `main` and never merge a GitHub PR into `main`.** The user controls updates to remote `main` and all deployments. Do not deploy in any form.
- Push a feature branch or open a PR only when authorized for the task. Neither action authorizes a merge into remote `main`.
