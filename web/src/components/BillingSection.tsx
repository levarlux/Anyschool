import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Loader2, CreditCard, Sparkles } from 'lucide-react';
import { deriveBillingState } from '../lib/billingState';

const API = '/api';

type TierKey = 'starter' | 'growth' | 'institution' | 'enterprise';
type Interval = 'monthly' | 'annual';

interface TierConfig {
  name: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  priceKES: { monthly: number; annual: number };
  limits: { students: number; staff: number; campuses: number; modules: number };
  features: string[];
}

interface SubscriptionState {
  tier: string;
  interval: Interval;
  status: string;
  amountKes: number;
  currency: string;
  paidAt: string | null;
  currentPeriodEnd: string | null;
}

interface Notice {
  kind: 'success' | 'error' | 'pending';
  text: string;
}

interface TiersResponse {
  mode: 'test' | 'live';
  priceSource: 'paystack-plans' | 'code-fallback';
  tiers: Record<TierKey, TierConfig>;
}

function formatKes(amount: number): string {
  return `KES ${amount.toLocaleString('en-KE')}`;
}

export default function BillingSection({ returnReference }: { returnReference: string | null }) {
  const [tiers, setTiers] = useState<Record<TierKey, TierConfig> | null>(null);
  const [mode, setMode] = useState<'test' | 'live' | null>(null);
  const [priceSource, setPriceSource] = useState<'paystack-plans' | 'code-fallback' | null>(null);
  const [sub, setSub] = useState<SubscriptionState | null>(null);
  const [billingInterval, setBillingInterval] = useState<Interval>('monthly');
  const [busyTier, setBusyTier] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Subscribers don't see purchasable plans unless they ask to change one
  const [showPlans, setShowPlans] = useState(false);
  // Gate: never render plans before we know the subscription state
  const [subLoaded, setSubLoaded] = useState(false);

  const loadSubscription = async () => {
    try {
      const res = await fetch(`${API}/payments/subscription`);
      if (res.ok) {
        const data = await res.json();
        setSub(data.subscription);
      }
    } catch {
      /* non-fatal — plan state stays unknown */
    } finally {
      setSubLoaded(true); // show something (plans or panel) only after we know
    }
  };

  useEffect(() => {
    fetch(`${API}/billing/tiers`)
      .then((r) => r.json())
      .then((data: TiersResponse) => {
        if (data?.tiers) {
          setTiers(data.tiers);
          setMode(data.mode);
          setPriceSource(data.priceSource);
        } else {
          setLoadError('Unexpected tiers response from API');
        }
      })
      .catch(() => setLoadError('Could not load plans. Is the API running?'));
    loadSubscription();
  }, []);

  // Verify-on-return: confirm the payment after Paystack redirects back
  useEffect(() => {
    if (!returnReference) return;
    (async () => {
      setNotice({ kind: 'pending', text: 'Confirming your payment with Paystack…' });
      try {
        const res = await fetch(`${API}/payments/verify?reference=${encodeURIComponent(returnReference)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Verification failed');
        if (data.status === 'active') {
          setNotice({ kind: 'success', text: `Payment received — your ${data.tier} plan is now active. Thank you!` });
          setShowPlans(false); // land on the confirmation panel, not the plan grid
        } else if (data.status === 'failed') {
          setNotice({ kind: 'error', text: 'The payment failed or could not be confirmed. You have not been charged.' });
        } else {
          setNotice({ kind: 'pending', text: `Payment status: ${data.status}. It will complete automatically once Paystack confirms it.` });
        }
      } catch (err) {
        setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not confirm the payment.' });
      }
      loadSubscription();
    })();
  }, [returnReference]);

  const startCheckout = async (tier: TierKey) => {
    setBusyTier(tier);
    setNotice(null);
    try {
      const res = await fetch(`${API}/payments/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, interval: billingInterval }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Checkout failed');
      window.location.href = data.authorizationUrl; // hosted Paystack page
      return; // navigating away
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Checkout failed' });
      setBusyTier(null);
    }
  };

  if (loadError) {
    return <div className="card" style={{ padding: 24 }}><p className="text-muted">{loadError}</p></div>;
  }

  const { subscribed, expired, currentTier, prettyTier } = deriveBillingState(sub);
  const periodEnd = sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
  const currentTierConfig = subscribed && sub && tiers ? tiers[sub.tier as TierKey] : undefined;
  const showPurchasable = !subscribed || showPlans;

  const annualSaving = tiers
    ? Math.max(0, Math.round((1 - tiers.starter.priceKES.annual / (tiers.starter.priceKES.monthly * 12)) * 100))
    : 0;

  return (
    <div className="page-enter">
      {mode === 'live' && (
        <div
          className="card"
          style={{
            padding: '14px 18px',
            marginBottom: 20,
            background: '#fef2f2',
            borderColor: '#ef4444',
            borderWidth: 1,
            borderStyle: 'solid',
            display: 'flex',
            gap: 10,
            alignItems: 'center',
          }}
        >
          <XCircle size={18} style={{ color: '#ef4444', flexShrink: 0 }} />
          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#b91c1c' }}>
            LIVE MODE — a sk_live_ key is armed. Real money will be charged.
          </span>
        </div>
      )}

      {notice && (
        <div
          className="card"
          style={{
            padding: '14px 18px',
            marginBottom: 20,
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            borderColor: notice.kind === 'success' ? '#22c55e' : notice.kind === 'error' ? '#ef4444' : '#f59e0b',
            borderWidth: 1,
            borderStyle: 'solid',
          }}
        >
          {notice.kind === 'pending' && <Loader2 size={18} style={{ color: '#f59e0b', animation: 'spin 1s linear infinite', flexShrink: 0 }} />}
          {notice.kind === 'success' && <CheckCircle2 size={18} style={{ color: '#22c55e', flexShrink: 0 }} />}
          {notice.kind === 'error' && <XCircle size={18} style={{ color: '#ef4444', flexShrink: 0 }} />}
          <span style={{ fontSize: '0.9rem' }}>{notice.text}</span>
        </div>
      )}

      <div className="card" style={{ padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Current Plan</h3>
            {subscribed ? (
              <p className="text-muted" style={{ marginTop: 6 }}>
                <strong style={{ color: 'var(--brand-text)' }}>{prettyTier}</strong>
                {' — '}{formatKes(sub!.amountKes)} / {sub!.interval}
                {sub!.currentPeriodEnd && <> · renews {new Date(sub!.currentPeriodEnd).toLocaleDateString()}</>}
              </p>
            ) : expired ? (
              <p className="text-muted" style={{ marginTop: 6 }}>
                <strong style={{ color: 'var(--brand-text)' }}>{prettyTier}</strong>
                {' — expired '}{periodEnd?.toLocaleDateString()} · renew any time below
              </p>
            ) : (
              <p className="text-muted" style={{ marginTop: 6 }}>
                {sub?.status === 'pending' ? 'A payment is pending confirmation…' : 'No active subscription — running on Starter defaults.'}
              </p>
            )}
          </div>
          {showPurchasable && (
            <div className="theme-tabs" role="tablist" aria-label="Billing interval">
              <button className={`theme-tab ${billingInterval === 'monthly' ? 'active' : ''}`} onClick={() => setBillingInterval('monthly')}>Monthly</button>
              <button className={`theme-tab ${billingInterval === 'annual' ? 'active' : ''}`} onClick={() => setBillingInterval('annual')}>
                Annual{annualSaving > 0 && <span style={{ marginLeft: 6, fontSize: '0.7rem', color: '#22c55e' }}>−{annualSaving}%</span>}
              </button>
            </div>
          )}
        </div>
      </div>

      {priceSource && showPurchasable && (
        <p className="text-muted" style={{ fontSize: '0.75rem', margin: '-12px 0 16px' }}>
          {priceSource === 'paystack-plans'
            ? 'Prices synced from your Paystack Plans — edit them in the Paystack dashboard, no deploy needed.'
            : 'Using built-in prices (Paystack Plans unreachable or none created).'}
        </p>
      )}

      {subscribed && !showPlans ? (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 16 }}>
            <div style={{ background: '#f0fdf4', borderRadius: '50%', padding: 11, display: 'flex', flexShrink: 0 }}>
              <CheckCircle2 size={26} style={{ color: '#22c55e' }} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>You're subscribed to {prettyTier}</div>
              <div className="text-muted" style={{ fontSize: '0.85rem' }}>
                Confirmed with Paystack · {formatKes(sub!.amountKes)} / {sub!.interval}
                {sub!.currentPeriodEnd && <> · renews {new Date(sub!.currentPeriodEnd).toLocaleDateString()}</>}
              </div>
            </div>
          </div>
          {currentTierConfig && (
            <>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 10 }}>What's included</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.85rem' }}>
                {currentTierConfig.features.map((f) => (
                  <li key={f} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
                    <CheckCircle2 size={14} style={{ color: '#22c55e', flexShrink: 0, marginTop: 2 }} />
                    <span>{f}</span>
                  </li>
                ))}
                <li style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <CheckCircle2 size={14} style={{ color: '#22c55e', flexShrink: 0, marginTop: 2 }} />
                  <span>
                    {currentTierConfig.limits.students === Infinity ? 'Unlimited' : `Up to ${currentTierConfig.limits.students}`} students ·{' '}
                    {currentTierConfig.limits.campuses === Infinity ? 'Unlimited' : currentTierConfig.limits.campuses} campus
                    {currentTierConfig.limits.campuses === 1 ? '' : 'es'}
                  </span>
                </li>
              </ul>
            </>
          )}
          <button className="btn btn-ghost" style={{ marginTop: 18 }} onClick={() => setShowPlans(true)}>
            Change plan
          </button>
        </div>
      ) : !tiers || !subLoaded ? (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', color: 'var(--brand-primary)' }} />
        </div>
      ) : (
        <>
        {subscribed && (
          <button className="btn btn-ghost" style={{ marginBottom: 12 }} onClick={() => setShowPlans(false)}>
            ← Back to my plan
          </button>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          {(Object.keys(tiers) as TierKey[]).map((key) => {
            const tier = tiers[key];
            const price = tier.priceKES[billingInterval];
            const isCurrent = currentTier === key;
            const isBusy = busyTier === key;
            const isPopular = key === 'growth';
            return (
              <div
                key={key}
                className="card"
                style={{
                  padding: 22,
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'relative',
                  borderColor: isCurrent ? 'var(--brand-primary)' : isPopular ? '#a855f7' : undefined,
                  borderWidth: isCurrent || isPopular ? 2 : 1,
                  borderStyle: 'solid',
                }}
              >
                {isPopular && (
                  <span
                    className="badge"
                    style={{ position: 'absolute', top: -10, left: 18, background: '#a855f7', color: '#fff', fontSize: '0.65rem' }}
                  >
                    <Sparkles size={10} style={{ marginRight: 4 }} /> Most popular
                  </span>
                )}
                <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{tier.name}</div>
                <p className="text-muted" style={{ fontSize: '0.8rem', margin: '6px 0 14px' }}>{tier.description}</p>
                <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>{formatKes(price)}</div>
                <div className="text-muted" style={{ fontSize: '0.78rem', marginBottom: 14 }}>
                  per {billingInterval === 'monthly' ? 'month' : 'year'}
                  {billingInterval === 'annual' && <> (≈ {formatKes(Math.round(price / 12))}/mo)</>}
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 18px', flex: 1, fontSize: '0.82rem' }}>
                  {tier.features.map((f) => (
                    <li key={f} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
                      <CheckCircle2 size={14} style={{ color: '#22c55e', flexShrink: 0, marginTop: 2 }} />
                      <span>{f}</span>
                    </li>
                  ))}
                  <li style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
                    <CheckCircle2 size={14} style={{ color: '#22c55e', flexShrink: 0, marginTop: 2 }} />
                    <span>
                      {tier.limits.students === Infinity ? 'Unlimited' : `Up to ${tier.limits.students}`} students ·{' '}
                      {tier.limits.campuses === Infinity ? 'Unlimited' : tier.limits.campuses} campus{tier.limits.campuses === 1 ? '' : 'es'}
                    </span>
                  </li>
                </ul>
                <button
                  className={`btn ${isCurrent ? 'btn-secondary' : 'btn-primary'}`}
                  style={{ width: '100%' }}
                  disabled={isCurrent || busyTier !== null}
                  onClick={() => startCheckout(key)}
                >
                  {isBusy ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : isCurrent ? 'Current plan' : sub?.status === 'active' ? 'Switch plan' : 'Upgrade'}
                  {!isBusy && !isCurrent && <CreditCard size={15} style={{ marginLeft: 6 }} />}
                </button>
              </div>
            );
          })}
        </div>
        </>
      )}
    </div>
  );
}
