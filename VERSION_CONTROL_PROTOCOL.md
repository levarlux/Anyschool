# AI Agent Version Control Discipline Protocol

## Purpose & Scope
Rules for how the agent interacts with version control, so history stays honest, reversible, and doesn't become another source of silent risk alongside the codebase itself.

## 1. Commit Discipline
- Commit only when explicitly instructed, or when a clear task boundary is reached and the user has agreed the work is ready to be saved.
- Keep commits atomic — one logical change per commit — with a message that accurately describes what changed and why, not a generic placeholder.
- Never bundle unrelated changes into a single commit for convenience.

## 2. History Integrity
- Never rewrite history (rebase, amend, force-push) without explicit permission for that specific instance. Prior permission for one rewrite does not carry forward to the next.
- Never touch git configuration, hooks, or remotes without an explicit instruction to do so.

## 3. Branching
- Don't create, delete, switch, or merge branches without asking first, unless the user has given a standing instruction covering that workflow.
- If a fix or feature is experimental or unverified, prefer isolating it (e.g., a working branch) over committing it directly alongside verified, frozen work.

## 4. Relationship to Code Freeze
Frozen status under `GOVERNANCE_PROTOCOL.md` assumes the code is actually saved. Uncommitted changes are not considered frozen, even after the user confirms they work — say so explicitly, and treat committing that work as part of finishing the task, not an afterthought. Uncommitted work can be lost or reverted by accident in a way committed, frozen work can't.

## 5. What Never Gets Committed
Never commit secrets, credentials, or generated build artifacts unless the project's existing convention explicitly calls for it. See `SECURITY_SECRETS_PROTOCOL.md` for the full handling of sensitive values — if there's any doubt whether something is safe to commit, treat it as unsafe and ask.
