import { Hono } from 'hono';
import { eq, isNull } from 'drizzle-orm';
import { createClerkClient } from '@clerk/backend';
import { db } from '../db';
import { schools } from '../../../drizzle/schema';
import { authEnabled, defaultSchoolId } from '../lib/authConfig';

const auth = new Hono();

// Created lazily — createClerkClient() throws without a publishable key, and
// the app must boot with auth disabled.
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

function slugForOrganization(organizationId: string, organizationSlug?: string | null) {
  const candidate = organizationSlug || `school-${organizationId}`;
  return candidate.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

auth.post('/bootstrap', async (c) => {
  // TEMP (build-out): auth disabled — hand back the default school so the
  // client can pin itself to the same tenant the API resolves.
  if (!authEnabled()) {
    const school = await db.query.schools.findFirst({ where: eq(schools.id, defaultSchoolId()) });
    return c.json({ schoolId: defaultSchoolId(), onboardingCompleted: school?.onboardingCompleted ?? false });
  }

  const userId = c.get('userId' as never) as string;
  let organizationId = c.get('clerkOrganizationId' as never) as string | null;

  // Every account owns exactly one school organization. Users cannot create
  // organizations themselves (Clerk "Allow user-created organizations" is off
  // and no UI offers creation), so when a session has no active org we attach
  // the account to its existing org — or create its single school org here,
  // server-side, via the Backend API (which the dashboard toggle does not
  // restrict).
  if (!organizationId) {
    try {
      const { data: memberships } = await clerk().users.getOrganizationMembershipList({ userId, limit: 10 });
      const existing = memberships[0]?.organization?.id;
      if (existing) {
        organizationId = existing;
      } else {
        const user = await clerk().users.getUser(userId);
        const email = user.emailAddresses[0]?.emailAddress ?? 'school';
        // No explicit slug: this instance has organization slugs disabled, and
        // Clerk generates a unique slug from the name when one isn't supplied.
        const org = await clerk().organizations.createOrganization({
          name: user.firstName ? `${user.firstName}'s School` : `${email.split('@')[0]}'s School`,
          createdBy: userId, // creator becomes org:admin
        });
        organizationId = org.id;
      }
    } catch (err) {
      console.error('[auth] organization provisioning failed:', err instanceof Error ? err.message : err);
      return c.json({ error: 'Could not set up your school organization' }, 502);
    }
    // The session's active organization must switch before the school row can
    // be provisioned — the client calls setActive() with this id and retries.
    return c.json({ organizationId, requiresActivation: true });
  }

  let school = await db.query.schools.findFirst({ where: eq(schools.clerkOrganizationId, organizationId) });

  if (!school) {
    // Claim the sole unclaimed school so existing tenant data (e.g. a seeded
    // installation) keeps its database UUID. Guarded so this can never grab a
    // school that another organization already owns, and so a fresh install
    // with zero schools still creates a new one.
    const unclaimed = await db.query.schools.findMany({
      where: isNull(schools.clerkOrganizationId),
      limit: 2,
    });
    if (unclaimed.length === 1) {
      const [claimed] = await db.update(schools)
        .set({ clerkOrganizationId: organizationId, updatedAt: new Date() })
        .where(eq(schools.id, unclaimed[0].id))
        .returning();
      school = claimed ?? await db.query.schools.findFirst({ where: eq(schools.clerkOrganizationId, organizationId) });
    }
  }

  if (!school) {
    try {
      const [created] = await db.insert(schools).values({
        name: 'New school',
        slug: slugForOrganization(organizationId, c.req.header('X-Clerk-Organization-Slug')),
        clerkOrganizationId: organizationId,
      }).returning();
      school = created;
    } catch {
      // Concurrent bootstrap (e.g. React StrictMode double-mount) hit the
      // unique index on clerk_organization_id — the other request won.
      school = await db.query.schools.findFirst({ where: eq(schools.clerkOrganizationId, organizationId) });
    }
  }

  if (!school) return c.json({ error: 'Unable to set up this school organization' }, 500);
  return c.json({ schoolId: school.id, onboardingCompleted: school.onboardingCompleted });
});

export default auth;
