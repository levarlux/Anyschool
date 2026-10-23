# AI Agent Task Execution Protocol — Analysis, Fixing & Verification

## Purpose & Scope
This document governs how any AI agent — regardless of model or tool — approaches a task on this codebase, from first hearing about an issue to handing back a verified fix. It works together with `GOVERNANCE_PROTOCOL.md`, which must already have been read this session. Nothing here is domain-specific: it applies equally to frontend, backend, mobile, infrastructure, data, or any other kind of software work. Adapt the specific checks in each phase to whatever this particular project actually is — do not assume a technology stack, and do not carry over assumptions from a previous project or session.

## Phase 1 — Intake & Intent Parsing
- Read the user's report, evidence, and description in full before forming any theory. Evidence may take many forms — screenshots, logs, error text, a description of behavior, reproduction steps — treat whatever is given as the source of truth, and do not assume evidence exists that hasn't been provided.
- Do not guess at intent or fill gaps with assumptions. If the report is ambiguous or incomplete, ask a clarifying question rather than proceeding on a best guess.
- Review the project's actual architecture and the ledger (per `GOVERNANCE_PROTOCOL.md`) so the agent understands current boundaries before forming any theory of the problem.

## Phase 2 — Investigation & Root-Cause Trace
- Systematically trace the actual codebase to find the real root cause, with verifiable evidence from the code itself. Do not stop at the first plausible-looking explanation — confirm it against what the code actually does.
- Do not reason from a fixed mental list of "usual suspects." Every issue is investigated on its own terms; the shape of the last bug does not predict the shape of this one.
- Before writing any code, output a clear technical finding covering:
  1. The exact file(s) and location(s) responsible for the failure.
  2. The root cause, explained in terms of what the code actually does — not a generic explanation.
  3. The proposed fix, at a level of detail the user can review before implementation.
  4. Explicit confirmation that the fix does not touch anything frozen in the ledger — or, if it does, that the Conflict & Dependency Gate has already been triggered and resolved.

## Phase 3 — Implementation
- Implement the fix cleanly and only where necessary. Touch only the code the current issue actually requires.
- Do not reformat unrelated code, rename things in passing, or introduce unrequested refactors, however tempting or "obviously better" they seem — that decision belongs to the user.
- Keep the change modular enough that it could be reviewed, reverted, or explained in isolation.

## Phase 4 — Pre-Handover Verification
Before presenting the fix, the agent must review it against real conditions relevant to this specific project — not a fixed checklist copied from a different kind of project. As a baseline, consider:
- **Lifecycle & state conditions** — what happens at startup/initialization, at teardown/shutdown, under rapid repeated use, and at data boundaries (none, one, many, maximum).
- **Persistence & propagation** — if state or data is meant to persist or propagate elsewhere in the system, verify it actually does, and that it survives a restart/reload/reconnection rather than silently reverting.
- **Interface & boundary integrity** — wherever this fix touches something the user or another system observes directly, verify there's no regression in how it's presented or consumed.
- **Concurrency & ordering** — if more than one thing can happen at once, check what happens when they do.

These are starting categories, not the whole checklist — the agent should reason about what "stress-testing" actually means for this specific fix, in this specific codebase, rather than mechanically applying a generic list.

## Phase 5 — User Verification & Handover
- Explain clearly what was changed and how it addresses the confirmed root cause — not a restatement of the symptom.
- Explicitly ask the user to test the fix in their real environment and report back.
- **Hold state.** Do not update the ledger, do not mark the task complete, and do not treat the component as frozen until the user has explicitly confirmed the fix works. The agent's own confidence is never a substitute for user confirmation.
