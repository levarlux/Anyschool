import { createClerkClient } from '@clerk/backend';
import type { Context, Next } from 'hono';
import { eq } from 'drizzle-orm';
import { appendFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { db } from './db';
import { schools } from '../../drizzle/schema';
import { authEnabled, defaultSchoolId, DEV_USER_ID } from './lib/authConfig';

// TEMP DIAGNOSTIC (Sat Oct 17 2026) — logs Clerk rejections to
// api/clerk-auth-debug.log. Remove once the 401 on bootstrap is explained.
const DEBUG_LOG = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'clerk-auth-debug.log');

async function debugLog(entry: Record<string, unknown>) {
  const line = JSON.stringify({ t: new Date().toISOString(), ...entry });
  console.error('[clerk-auth-debug]', line);
  try { await appendFile(DEBUG_LOG, line + '\n'); } catch {}
}

// The Clerk client is created lazily: createClerkClient() throws when the
// publishable key is missing, and the app must still boot with auth disabled
// (and no Clerk keys configured at all).
let clerkClient: ReturnType<typeof createClerkClient> | null = null;
function clerk() {
  if (!clerkClient) {
    clerkClient = createClerkClient({
      secretKey: process.env.CLERK_SECRET_KEY,
      publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
    });
  }
  return clerkClient;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function authorizedParties(): string[] {
  const configured = process.env.CLERK_AUTHORIZED_PARTIES?.split(',').map((value) => value.trim()).filter(Boolean);
  return configured?.length ? configured : ['http://localhost:5174', 'http://127.0.0.1:5174'];
}

function requestedSchoolId(c: Context): string | undefined {
  return c.req.query('schoolId') || c.req.path.split('/').find((segment) => uuidPattern.test(segment));
}

export async function clerkAuth(c: Context, next: Next) {
  // Public webhook endpoint — Paystack signs the body (HMAC-SHA512) instead;
  // it has no Clerk token, so it must skip auth entirely.
  if (c.req.path === '/api/payments/webhook') return next();

  // TEMP (build-out): authentication is disabled — every request runs as the
  // local dev user against the default school, with no token required.
  if (!authEnabled()) {
    c.set('userId' as never, DEV_USER_ID as never);
    c.set('clerkOrganizationId' as never, null as never);
    c.set('schoolId' as never, defaultSchoolId() as never);
    return next();
  }

  if (!process.env.CLERK_SECRET_KEY || !process.env.CLERK_PUBLISHABLE_KEY) {
    return c.json({ error: 'Clerk is not configured on the API' }, 503);
  }

  const state = await clerk().authenticateRequest(c.req.raw, { authorizedParties: authorizedParties() });
  if (!state.isAuthenticated) {
    const authHeader = c.req.header('Authorization');
    let tokenClaims: unknown = null;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const payload = JSON.parse(Buffer.from(authHeader.slice(7).split('.')[1]!, 'base64url').toString('utf8'));
        tokenClaims = { iss: payload.iss, azp: payload.azp, exp: payload.exp, nbf: payload.nbf, sid: payload.sid, org_id: payload.org_id };
      } catch { tokenClaims = 'unparsable'; }
    }
    await debugLog({
      path: c.req.path,
      hasAuthHeader: !!authHeader,
      authorizedParties: authorizedParties(),
      reason: (state as { reason?: unknown }).reason ?? null,
      message: (state as { message?: unknown }).message ?? null,
      tokenClaims,
    });
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const auth = state.toAuth();
  if (!auth.userId) {
    await debugLog({ path: c.req.path, stage: 'no-userId' });
    return c.json({ error: 'Unauthorized' }, 401);
  }
  c.set('userId' as never, auth.userId as never);
  c.set('clerkOrganizationId' as never, auth.orgId as never);

  // Expose the signed-in email for billing checkout (Clerk session claim).
  const claims = auth.sessionClaims as Record<string, unknown> | undefined;
  if (typeof claims?.email === 'string') {
    c.set('userEmail' as never, claims.email as never);
  }

  if (c.req.path === '/api/auth/bootstrap') return next();
  if (!auth.orgId) return c.json({ error: 'Select a school organization before continuing' }, 403);

  const school = await db.query.schools.findFirst({ where: eq(schools.clerkOrganizationId, auth.orgId) });
  if (!school) return c.json({ error: 'This organization has not been set up as a school yet' }, 403);

  const requested = requestedSchoolId(c);
  if (requested && requested !== school.id) return c.json({ error: 'Forbidden tenant access' }, 403);

  c.set('schoolId' as never, school.id as never);
  await next();
}
