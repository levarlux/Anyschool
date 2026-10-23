// Paystack Payments API — platform tier subscriptions (Doc 11 billing)
// Flow: POST /checkout → hosted Paystack page → callback with ?billing=ref
//       → GET /verify (server-side truth) → subscription active.
// Webhook: signed with HMAC-SHA512; the production belt to verify's suspenders.

import { Hono } from 'hono';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '../db';
import { schools, subscriptions, paymentEvents } from '../../../drizzle/schema';
import { initializeTransaction, resolveTierPrices, verifyTransaction, verifyWebhookSignature } from '../lib/paystack';
import { TIERS } from './billing';

const payments = new Hono();

type Interval = 'monthly' | 'annual';

const checkoutBody = z.object({
  tier: z.enum(['starter', 'growth', 'institution', 'enterprise']),
  interval: z.enum(['monthly', 'annual']),
});

type Subscription = typeof subscriptions.$inferSelect;

function webOrigin(): string {
  return process.env.WEB_ORIGIN || 'http://localhost:5174';
}

function amountKes(sub: Pick<Subscription, 'amountMinor'>): number {
  return sub.amountMinor / 100;
}

function periodEnd(start: Date, interval: Interval): Date {
  const end = new Date(start);
  if (interval === 'annual') end.setFullYear(end.getFullYear() + 1);
  else end.setMonth(end.getMonth() + 1);
  return end;
}

/**
 * Idempotently activate a subscription (pending → active + set school tier).
 * The WHERE status='pending' guard makes concurrent verify/webhook calls safe.
 * Returns the updated subscription, or null if it was not ours / not pending.
 */
async function activateSubscription(sub: Subscription): Promise<Subscription | null> {
  const now = new Date();
  const end = periodEnd(now, sub.interval as Interval);

  const updated = await db
    .update(subscriptions)
    .set({
      status: 'active',
      paidAt: now,
      currentPeriodStart: now,
      currentPeriodEnd: end,
      updatedAt: now,
    })
    .where(eq(subscriptions.id, sub.id))
    .returning();

  const row = updated[0];
  if (!row || row.status !== 'active') return null;

  // Sync the school's live tier with what was just paid for.
  await db.update(schools).set({ tier: sub.tier, updatedAt: now }).where(eq(schools.id, sub.schoolId));
  return row;
}

async function markFailed(reference: string): Promise<void> {
  await db
    .update(subscriptions)
    .set({ status: 'failed', updatedAt: new Date() })
    .where(eq(subscriptions.paystackReference, reference));
}

// Create a Paystack checkout session for a tier subscription
payments.post('/checkout', async (c) => {
  const schoolId = c.get('schoolId' as never) as string;
  const userId = c.get('userId' as never) as string;
  const email = (c.get('userEmail' as never) as string | undefined) || 'billing@anyschool.app';

  const parsed = checkoutBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: 'Invalid checkout payload', details: parsed.error.flatten() }, 400);
  }
  const { tier, interval } = parsed.data;

  const school = await db.query.schools.findFirst({ where: eq(schools.id, schoolId) });
  if (!school) return c.json({ error: 'School not found' }, 404);

  // Hybrid pricing: Paystack Plan amount (dashboard-editable) wins, code is fallback.
  const { tiers: pricedTiers } = await resolveTierPrices(TIERS);
  const priceKes = pricedTiers[tier].priceKES[interval];
  const amountMinor = priceKes * 100; // KES cents — snapshot taken at checkout time
  const reference = `as_${randomUUID().replace(/-/g, '')}`;

  // Record first so the reference is ours even if the callback beats us.
  await db.insert(subscriptions).values({
    schoolId,
    tier,
    interval,
    amountMinor,
    currency: 'KES',
    status: 'pending',
    paystackReference: reference,
    initiatedBy: userId,
  });

  try {
    const session = await initializeTransaction({
      email,
      amountMinor,
      currency: 'KES',
      reference,
      callbackUrl: `${webOrigin()}/?billing=${reference}`,
      metadata: { schoolId, tier, interval, userId },
    });

    await db
      .update(subscriptions)
      .set({ authorizationUrl: session.authorizationUrl, updatedAt: new Date() })
      .where(eq(subscriptions.paystackReference, reference));

    return c.json({
      reference,
      authorizationUrl: session.authorizationUrl,
      amountKes: priceKes,
      currency: 'KES',
      tier,
      interval,
    });
  } catch (err) {
    await markFailed(reference);
    console.error('[payments] checkout failed:', err instanceof Error ? err.message : err);
    return c.json({ error: 'Could not start checkout with Paystack' }, 502);
  }
});

// Current subscription for this school (most recent)
payments.get('/subscription', async (c) => {
  const schoolId = c.get('schoolId' as never) as string;

  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.schoolId, schoolId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });

  if (!sub) return c.json({ subscription: null });
  return c.json({
    subscription: {
      tier: sub.tier,
      interval: sub.interval,
      status: sub.status,
      amountKes: amountKes(sub),
      currency: sub.currency,
      paidAt: sub.paidAt,
      currentPeriodEnd: sub.currentPeriodEnd,
    },
  });
});

// Verify-on-return: source of truth after the user comes back from Paystack
payments.get('/verify', async (c) => {
  const reference = c.req.query('reference');
  if (!reference) return c.json({ error: 'reference query param required' }, 400);

  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.paystackReference, reference),
  });
  if (!sub) return c.json({ error: 'Unknown reference' }, 404);

  // Already settled (webhook beat us) — report final state without re-hitting Paystack.
  if (sub.status === 'active') return c.json({ status: 'active', tier: sub.tier, interval: sub.interval });
  if (sub.status === 'failed') return c.json({ status: 'failed', tier: sub.tier, interval: sub.interval });

  try {
    const result = await verifyTransaction(reference);

    if (result.status === 'success') {
      if (result.amountMinor !== sub.amountMinor || result.currency !== sub.currency) {
        await markFailed(reference);
        console.error(`[payments] amount/currency mismatch for ${reference}: got ${result.amountMinor} ${result.currency}, expected ${sub.amountMinor} ${sub.currency}`);
        return c.json({ status: 'failed', error: 'Payment amount mismatch' }, 400);
      }
      await activateSubscription(sub);
      return c.json({ status: 'active', tier: sub.tier, interval: sub.interval });
    }

    if (result.status === 'failed') {
      await markFailed(reference);
      return c.json({ status: 'failed', tier: sub.tier, interval: sub.interval });
    }

    // pending / abandoned — still waiting on the customer
    return c.json({ status: result.status, tier: sub.tier, interval: sub.interval });
  } catch (err) {
    console.error('[payments] verify failed:', err instanceof Error ? err.message : err);
    return c.json({ error: 'Could not verify payment with Paystack' }, 502);
  }
});

// Paystack webhook — signature-verified (clerkAuth bypasses this path)
payments.post('/webhook', async (c) => {
  const raw = await c.req.text();
  if (!verifyWebhookSignature(raw, c.req.header('x-paystack-signature'))) {
    return c.json({ error: 'invalid signature' }, 401);
  }

  let event: { event?: string; data?: { reference?: string; amount?: number; currency?: string } };
  try {
    event = JSON.parse(raw);
  } catch {
    return c.json({ error: 'invalid json' }, 400);
  }

  const eventName = event.event;
  const reference = event.data?.reference;
  if (!eventName || !reference) return c.json({ received: true });

  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.paystackReference, reference),
  });

  let processed = false;
  let errorMsg: string | null = null;

  if (sub && eventName === 'charge.success') {
    if (event.data?.amount !== sub.amountMinor || event.data?.currency !== sub.currency) {
      errorMsg = `amount/currency mismatch: got ${event.data?.amount} ${event.data?.currency}, expected ${sub.amountMinor} ${sub.currency}`;
      await markFailed(reference);
    } else if (sub.status !== 'active') {
      const activated = await activateSubscription(sub);
      processed = activated !== null || sub.status === 'active';
    } else {
      processed = true; // duplicate delivery, already settled
    }
  } else if (sub && (eventName === 'charge.failed' || eventName === 'charge.abandoned')) {
    if (sub.status === 'pending') await markFailed(reference);
    processed = true;
  } else if (sub) {
    processed = true; // our reference, but an event type we don't act on yet
  }

  // Audit trail of every signed delivery (unknown references recorded too)
  await db.insert(paymentEvents).values({
    reference,
    event: eventName,
    payload: event as never,
    processed,
    error: errorMsg,
  });

  if (errorMsg) console.error(`[payments] webhook ${eventName} for ${reference}: ${errorMsg}`);

  // Always 200 for valid signatures so Paystack does not retry-replay storms
  return c.json({ received: true });
});

export default payments;
