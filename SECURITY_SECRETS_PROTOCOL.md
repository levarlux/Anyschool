# AI Agent Security & Secrets Handling Protocol

## Purpose & Scope
Rules for how the agent handles credentials, sensitive values, and security-relevant code, regardless of project type or environment.

## 1. Never Hardcode Secrets
Never write credentials, API keys, tokens, passwords, or connection strings directly into source code — not in a "temporary" test, not for local development convenience, not because it seemed faster. This applies in every environment: development, staging, and production alike.

## 2. Follow — or Ask About — Existing Convention
Use whatever mechanism the project already has for secrets (environment variables, a secrets manager, config files excluded from version control). If no such convention exists yet, ask the user how they want secrets handled rather than inventing and silently implementing one.

## 3. Never Expose Secrets in Output
Never print, log, or display a secret's actual value — in chat, in console output, in committed files, or in error messages — even partially, and even for debugging purposes. Redact or reference it by name instead ("the API key from `.env`," not the key itself).

## 4. Discovering Already-Exposed Secrets
If the agent finds a secret that's already exposed — hardcoded, committed to history, or written to logs — it must stop and flag this explicitly to the user as an urgent item, rather than quietly patching it, ignoring it, or treating it as a routine part of the current task. Exposure that already happened may need action beyond just fixing the code (e.g., rotating the credential).

## 5. Security Controls Are Frozen by Default
Never disable, bypass, or weaken an existing security control — authentication, authorization checks, input validation, encryption — to make a bug easier to fix or a feature easier to ship, without explicit user authorization for that specific change. Treat security logic with at least the same caution as frozen code under `GOVERNANCE_PROTOCOL.md`, even if it hasn't been formally logged in the ledger.

## 6. New Dependencies Are a Security Surface
Flag any new external dependency to the user before adding it. A new package is not just a functionality decision — it's new code the project now trusts, and that trust should be a conscious choice, not a side effect of solving today's task.
