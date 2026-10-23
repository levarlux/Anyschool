# AI Agent Governance Protocol — Code Freeze & Progressive Memory

## Purpose & Scope
This document is binding operating law for any AI agent working on this codebase, regardless of which model or tool is being used. It applies to every session, from the first message onward, and does not expire, reset, or weaken over the course of a conversation. If a new session begins — even with a different AI model — this document must be read and acknowledged again before any code is touched.

## 1. Session Bootstrap (Read Before Anything Else)
Before taking any action — before answering a question, reading code, or writing a single line — the agent must locate and fully read all of the following:
1. This file, `GOVERNANCE_PROTOCOL.md`.
2. `EXECUTION_PROTOCOL.md`
3. `CONTINUITY_HANDOFF_PROTOCOL.md`
4. `COMMUNICATION_ESCALATION_PROTOCOL.md`
5. `VERSION_CONTROL_PROTOCOL.md`
6. `SECURITY_SECRETS_PROTOCOL.md`
7. The project's ledger file (see Section 3) if one exists.
8. The latest continuity snapshot (see `CONTINUITY_HANDOFF_PROTOCOL.md`) if one exists.

Only after reading all of the above should the agent confirm, in its own words, that it understands current frozen components, open items, and any pending questions, before proceeding.

If any of these files cannot be found, the agent must say so explicitly and ask the user where they are, rather than proceeding as if no protocol exists.

## 2. Core Rule: Zero Regressions (Code Freeze)
- **Absolute protection.** Once the user has explicitly tested a component, function, logic block, feature, or behavior and confirmed it is fully working, that code enters immediate **CODE FREEZE** — regardless of language, framework, platform, or how small the change seems.
- **Prohibition.** The agent is strictly forbidden from modifying, refactoring, deleting, reordering, or bypassing any frozen code for any subsequent task, unless the user explicitly authorizes touching that specific frozen component in that specific session.
- **No silent scope creep.** "Cleaning up while I'm in there" is not authorization. If a task doesn't require touching frozen code, it must not be touched.

## 3. Progressive Ledger System
The agent must maintain a living record — by default `verified-fixes-ledger.md` in the project root, or wherever the user indicates the project already keeps this kind of record — that serves as the project's permanent memory across sessions and across AI models.

**Trigger:** An entry is added only when the user has explicitly tested a fix or feature themselves and given clear, unambiguous confirmation that it works. The agent's own belief that something works is never sufficient grounds for a ledger entry.

**Each entry must document:**
1. **Resolved issue** — a precise, factual summary of the problem or requirement, in the project's actual terms, not a generic template.
2. **Target components** — the exact files, modules, functions, or areas modified, named precisely.
3. **Implemented approach** — the actual logic, pattern, or mechanism used to solve it, described accurately enough that a future agent could understand the change without re-reading the diff.
4. **Freeze status** — an explicit statement that this is now frozen and protected, and the date/session it was frozen in if that information is available.

The agent must never pre-fill, guess, or embellish ledger entries. Every field must reflect what actually happened, not what plausibly could have happened.

## 4. Conflict & Dependency Gate
Before writing or altering any code for a new task, the agent must:
1. Scan the ledger to identify every currently frozen component.
2. Cross-reference the planned change against that list.
3. **Stop condition:** If resolving the current issue requires touching a frozen component, the agent must stop before writing any code and output:
   `"CONFLICT DETECTED: Resolving [new issue] impacts the frozen component [component name] logged in [ledger entry reference]."`
   It must then explain the specific conflict and wait for explicit, manual user override before proceeding. Silence, ambiguity, or an unrelated reply from the user is not authorization to proceed.

## 5. Verification & Anti-Hallucination Mandate
This section overrides convenience in every case.
- The agent must ground every technical claim in something it actually observed — actual file contents, actual error output, actual ledger entries — never in a memorized pattern, a guess, or what "usually" causes this kind of issue in similar projects.
- The agent must never fabricate file names, line numbers, function names, prior fixes, or user statements. If it cannot verify something, it must say so plainly rather than presenting a plausible guess as fact.
- The agent must not force this project's specifics into a template it recalls from training or from a different past task. Every project, bug, and fix is treated as its own case, investigated fresh.
- When uncertain, the agent asks a direct question rather than proceeding on an assumption. A wrong assumption acted on silently is a worse outcome than a clarifying question.
