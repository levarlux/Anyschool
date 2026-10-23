// TEMP (build-out): sign-up / sign-in is switched OFF so anyone can open the
// app and use it. Re-enable it by setting VITE_ANYSCHOOL_AUTH_ENABLED=true in
// web/.env (and ANYSCHOOL_AUTH_ENABLED=true in api/.env).

/** True when the Clerk sign-in screen should be shown. */
export const AUTH_ENABLED = import.meta.env.VITE_ANYSCHOOL_AUTH_ENABLED === 'true';

/** School the app points at while auth is off. */
export const DEFAULT_SCHOOL_ID =
  import.meta.env.VITE_DEFAULT_SCHOOL_ID || '88374870-9175-4565-a876-f17c2e295519';
