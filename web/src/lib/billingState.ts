// Pure decision logic for the Billing tab — extracted for testability.
// A subscription only counts as active while its paid period is still running.

export interface BillingSubLike {
  tier: string;
  status: string;
  currentPeriodEnd?: string | null;
}

export interface BillingState {
  /** Active AND within the paid period → hide purchasable plans. */
  subscribed: boolean;
  /** Status says active but the period has lapsed → show plans for renewal. */
  expired: boolean;
  /** Tier to mark as "Current plan" in the grid (null when buyable again). */
  currentTier: string | null;
  /** Display name, e.g. 'growth' → 'Growth'. */
  prettyTier: string;
}

export function deriveBillingState(sub: BillingSubLike | null, now: Date = new Date()): BillingState {
  const isActive = sub?.status === 'active';
  const periodEnd = sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
  const subscribed = !!isActive && (periodEnd === null || periodEnd.getTime() > now.getTime());

  return {
    subscribed,
    expired: !!isActive && !subscribed,
    currentTier: subscribed && sub ? sub.tier : null,
    prettyTier: sub ? sub.tier.charAt(0).toUpperCase() + sub.tier.slice(1) : '',
  };
}
