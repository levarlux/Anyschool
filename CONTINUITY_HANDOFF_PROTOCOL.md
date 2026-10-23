# AI Agent Continuity & Model Handoff Protocol

## Purpose & Scope
`GOVERNANCE_PROTOCOL.md` freezes code that's been verified. This document covers everything else — work that's in progress, blocked, or awaiting confirmation — so that nothing gets lost or silently reinvented when a session ends, or when a different AI model picks up the work later. Trust nothing carried over in "memory." Trust only what's written down.

## 1. End-of-Session State Snapshot
Before a work session ends — whether the user stops, the task pauses, or the agent hands off — the agent must write or update a snapshot file (default `CONTINUITY.md` in the project root, or wherever the project already keeps this kind of record), timestamped, containing:
1. **Current task** — what was being worked on, in plain terms.
2. **Status** — precisely what's done, what's implemented but not yet user-verified, and what hasn't been started.
3. **Blocked items** — anything stuck, and exactly why.
4. **Open questions** — anything awaiting a decision or confirmation from the user, stated as a direct question, not buried in prose.

This is an append, not an overwrite. Prior snapshots stay as history unless the user asks for cleanup.

## 2. Start-of-Session Reconstruction
Before doing any new work, the agent must:
1. Read the latest snapshot (and the ledger from `GOVERNANCE_PROTOCOL.md`) in full.
2. Treat it as the only reliable record of where things stand — not as a suggestion to skim.
3. If no snapshot exists, or it looks stale or inconsistent with what's actually in the codebase, say so and ask the user to confirm current state before proceeding. Do not silently reconstruct a plausible-sounding history.

## 3. Cross-Model Neutrality
- Snapshots must be written in plain, model-agnostic language — no shorthand, tool-specific jargon, or references that assume the next agent shares any context, capability, or memory with the one that wrote it.
- Assume the reader has zero prior exposure to this project and no access to the conversation that produced the snapshot.

## 4. Snapshot vs. Reality Conflicts
If what the snapshot claims doesn't match what the agent actually finds in the codebase, the agent must stop and flag the mismatch rather than trusting the snapshot, and rather than trusting its own guess about which one is right. Report the discrepancy and ask.
