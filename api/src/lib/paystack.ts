// Paystack API client (test mode) — Doc: https://paystack.com/docs/api
// Used by routes/payments.ts for platform tier subscriptions.
import { createHmac, timingSafeEqual } from 'crypto';

const PAYSTACK_BASE = 'https://api.paystack.co';

/** 'test' (sk_test_) or 'live' (sk_live_) — derived from the key itself. */
export function paystackMode(): 'test' | 'live' {
  return process.env.PAYSTACK_SECRET_KEY?.startsWith('sk_live_') ? 'live' : 'test';
}

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error('PAYSTACK_SECRET_KEY is not configured');
  return key;
}

export interface InitializeParams {
  email: string;
  amountMinor: number; // minor units (KES cents)
  currency: string; // 'KES'
  reference: string;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface InitializeResult {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}

/** POST /transaction/initialize — creates a hosted checkout session. */
export async function initializeTransaction(params: InitializeParams): Promise<InitializeResult> {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: params.email,
      amount: params.amountMinor,
      currency: params.currency,
      reference: params.reference,
      callback_url: params.callbackUrl,
      metadata: params.metadata,
    }),
  });

  const body = (await res.json()) as {
    status: boolean;
    message: string;
    data?: { authorization_url: string; access_code: string; reference: string };
  };

  if (!res.ok || !body.status || !body.data) {
    throw new Error(`Paystack initialize failed: ${body.message || res.statusText}`);
  }

  return {
    authorizationUrl: body.data.authorization_url,
    accessCode: body.data.access_code,
    reference: body.data.reference,
  };
}

export interface VerifyResult {
  status: 'success' | 'failed' | 'abandoned' | 'pending' | 'reversed' | string;
  amountMinor: number; // amount in minor units
  currency: string;
  reference: string;
  paidAt: string | null;
  channel: string | null;
  gatewayResponse: string | null;
}

/** GET /transaction/verify/:reference — source of truth for payment status. */
export async function verifyTransaction(reference: string): Promise<VerifyResult> {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secretKey()}` },
  });

  const body = (await res.json()) as {
    status: boolean;
    message: string;
    data?: {
      status: string;
      amount: number;
      currency: string;
      reference: string;
      paid_at: string | null;
      channel: string | null;
      gateway_response: string | null;
    };
  };

  if (!res.ok || !body.status || !body.data) {
    throw new Error(`Paystack verify failed: ${body.message || res.statusText}`);
  }

  return {
    status: body.data.status,
    amountMinor: body.data.amount,
    currency: body.data.currency,
    reference: body.data.reference,
    paidAt: body.data.paid_at,
    channel: body.data.channel,
    gatewayResponse: body.data.gateway_response,
  };
}

/**
 * Verify the x-paystack-signature header (HMAC-SHA512 of the raw body with
 * the secret key) using a timing-safe comparison.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean {
  if (!signature) return false;
  const expected = createHmac('sha512', secretKey()).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ---- Hybrid pricing: Paystack Plans override code-defined prices ----

export type BillingInterval = 'monthly' | 'annual';

interface PaystackPlan {
  name: string;
  plan_code: string;
  amount: number; // minor units
  currency: string;
  interval: string; // 'monthly' | 'annually' | ...
  active?: boolean; // not present on all responses
  is_deleted?: boolean;
  is_archived?: boolean;
}

function isUsablePlan(p: PaystackPlan): boolean {
  return p.active !== false && !p.is_deleted && !p.is_archived && p.currency === 'KES';
}

const PLAN_TTL_MS = 5 * 60 * 1000; // 5-minute cache — prices don't flap
let planCache: { at: number; plans: PaystackPlan[] } | null = null;

/** Invalidate the plan cache (next fetchPlans hits Paystack again). */
export function clearPlanCache(): void {
  planCache = null;
}

/** GET /plan — listable plan catalog for the key's mode (test vs live). */
export async function fetchPlans(): Promise<PaystackPlan[]> {
  if (planCache && Date.now() - planCache.at < PLAN_TTL_MS) return planCache.plans;
  const res = await fetch(`${PAYSTACK_BASE}/plan`, {
    headers: { Authorization: `Bearer ${secretKey()}` },
  });
  const body = (await res.json()) as { status: boolean; message: string; data?: PaystackPlan[] };
  if (!res.ok || !body.status) {
    throw new Error(`Paystack list plans failed: ${body.message || res.statusText}`);
  }
  planCache = { at: Date.now(), plans: body.data ?? [] };
  return planCache.plans;
}

function planLabel(tier: string, interval: BillingInterval): string {
  const pretty = tier.charAt(0).toUpperCase() + tier.slice(1);
  return `AnySchool ${pretty} ${interval === 'monthly' ? 'Monthly' : 'Annual'}`;
}

/**
 * Hybrid pricing: override each tier's priceKES with the matching Paystack
 * Plan amount when one exists (dashboard-editable, mode-aware); otherwise
 * fall back to the code-defined price. Never throws.
 */
export async function resolveTierPrices<
  T extends Record<string, { priceKES: Record<BillingInterval, number> }>,
>(tiers: T): Promise<{ tiers: T; priceSource: 'paystack-plans' | 'code-fallback' }> {
  let plans: PaystackPlan[];
  try {
    plans = await fetchPlans();
  } catch (err) {
    console.warn('[payments] plan pull failed, using code prices:', err instanceof Error ? err.message : err);
    return { tiers, priceSource: 'code-fallback' };
  }

  const byName = new Map(plans.filter(isUsablePlan).map((p) => [p.name, p]));
  const out = structuredClone(tiers) as T;
  let matched = false;

  for (const [key, tier] of Object.entries(out)) {
    for (const interval of ['monthly', 'annual'] as const) {
      const plan = byName.get(planLabel(key, interval));
      if (plan && typeof plan.amount === 'number' && plan.amount > 0) {
        tier.priceKES[interval] = Math.round(plan.amount / 100);
        matched = true;
      }
    }
  }

  return { tiers: out, priceSource: matched ? 'paystack-plans' : 'code-fallback' };
}
