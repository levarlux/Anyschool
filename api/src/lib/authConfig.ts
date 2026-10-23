// TEMP (build-out): sign-up / sign-in is switched OFF so anyone can open the
// app and use it. Re-enable it by setting ANYSCHOOL_AUTH_ENABLED=true in
// api/.env (and VITE_ANYSCHOOL_AUTH_ENABLED=true in web/.env).
//
// The values are read lazily (function calls, not module constants) because
// dotenv is loaded by ./db at import time — module-level reads in sibling
// modules can run before the .env file is parsed.

/** True when Clerk authentication should be enforced. */
export function authEnabled(): boolean {
  return process.env.ANYSCHOOL_AUTH_ENABLED === 'true';
}

/** School every unauthenticated request is scoped to while auth is off. */
export function defaultSchoolId(): string {
  return process.env.ANYSCHOOL_DEFAULT_SCHOOL_ID || '88374870-9175-4565-a876-f17c2e295519';
}

/** Stand-in for the Clerk user id while auth is off (no FK — plain text). */
export const DEV_USER_ID = 'dev-local-user';
