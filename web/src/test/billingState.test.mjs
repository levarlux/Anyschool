// Regression test for deriveBillingState — the logic that decides whether the
// Billing tab shows the confirmation panel (subscribers) or purchasable plans.

import { deriveBillingState } from '../lib/billingState.ts';

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  PASS: ${msg}`); passed++; }
  else { console.error(`  FAIL: ${msg}`); failed++; }
}

const NOW = new Date('2026-10-18T12:00:00Z');
const future = '2026-11-18T12:00:00.000Z';
const past = '2026-10-11T12:00:00.000Z';

console.log('Test 1: active + future period end → subscriber view (plans hidden)');
{
  const s = deriveBillingState({ tier: 'growth', status: 'active', currentPeriodEnd: future }, NOW);
  assert(s.subscribed === true, 'subscribed = true');
  assert(s.expired === false, 'expired = false');
  assert(s.currentTier === 'growth', 'currentTier = growth (grid would mark it Current plan only when shown)');
  assert(s.prettyTier === 'Growth', 'prettyTier capitalized');
}

console.log('Test 2: active + PAST period end → expired, plans shown for renewal');
{
  const s = deriveBillingState({ tier: 'institution', status: 'active', currentPeriodEnd: past }, NOW);
  assert(s.subscribed === false, 'subscribed = false (payment period lapsed)');
  assert(s.expired === true, 'expired = true');
  assert(s.currentTier === null, 'currentTier = null → same tier buyable again');
}

console.log('Test 3: active + no period end recorded → still subscribed');
{
  const s = deriveBillingState({ tier: 'starter', status: 'active', currentPeriodEnd: null }, NOW);
  assert(s.subscribed === true, 'subscribed = true (trust status)');
}

console.log('Test 4: pending payment → not subscribed, plans visible');
{
  const s = deriveBillingState({ tier: 'growth', status: 'pending', currentPeriodEnd: null }, NOW);
  assert(s.subscribed === false && s.expired === false, 'neither subscribed nor expired');
  assert(s.currentTier === null, 'currentTier = null');
  assert(s.prettyTier === 'Growth', 'prettyTier still available for messages');
}

console.log('Test 5: failed payment → plans visible');
{
  const s = deriveBillingState({ tier: 'growth', status: 'failed', currentPeriodEnd: future }, NOW);
  assert(s.subscribed === false && s.expired === false, 'failed does not subscribe');
}

console.log('Test 6: no subscription at all');
{
  const s = deriveBillingState(null, NOW);
  assert(s.subscribed === false && s.expired === false && s.currentTier === null && s.prettyTier === '', 'all-empty defaults');
}

console.log('Test 7: boundary — period ends exactly NOW → not subscribed (must be strictly after)');
{
  const s = deriveBillingState({ tier: 'growth', status: 'active', currentPeriodEnd: NOW.toISOString() }, NOW);
  assert(s.subscribed === false && s.expired === true, 'expiry is inclusive at the boundary');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
