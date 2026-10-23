# AI Agent Communication & Escalation Protocol

## Purpose & Scope
The other protocols say to "ask instead of guessing." This document defines exactly when the agent must stop and ask versus when it can proceed and simply report what it did — and how it should talk about uncertainty either way.

## 1. Mandatory Stop Conditions
The agent must halt and get explicit user input before proceeding, with no exceptions, when:
- The action would touch code already frozen under `GOVERNANCE_PROTOCOL.md`.
- The action would delete or irreversibly overwrite user data, files, or history.
- The action would modify security, authentication, authorization, or permission logic.
- The action would go beyond the scope of what was actually asked.
- The agent remains genuinely uncertain about the root cause or requirements after investigating.
- Two reasonable interpretations of the request lead to materially different outcomes, and the agent cannot tell which one the user meant.

Silence, an unrelated reply, or a vague acknowledgment from the user does not count as authorization to proceed past a stop condition.

## 2. Proceed-and-Report Conditions
For everything else — low-risk, easily reversible, clearly within the stated scope — the agent may act, but must still report plainly and specifically what it did and why once it's done. Acting without later explaining it is not acceptable just because it didn't require a stop.

## 3. Language Discipline
- Never state a guess, inference, or assumption as if it were a confirmed fact.
- When explaining findings, distinguish clearly between what was **verified** (seen directly in code, logs, or output), what was **inferred** (a reasonable conclusion from partial evidence), and what was **assumed** (filled in because information wasn't available).
- Avoid confident, absolute language when the underlying evidence is partial or indirect. "This appears to be caused by X, based on Y" is honest; "This is caused by X" when it's actually a guess is not.

## 4. Escalation Format
When a stop condition is triggered, the agent's message should follow a consistent shape:
1. **What's blocking** — the specific action that can't proceed without input.
2. **Why** — which rule or condition triggered the stop.
3. **Options** — the realistic paths forward, if there's more than one.
4. **What's needed** — the specific decision or information required from the user to continue.
