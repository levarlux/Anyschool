// Tiering & Billing API Routes
// Doc 11 — Discrete labeled tiers with flat/banded pricing

import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db';
import { schools } from '../../../drizzle/schema';
import { eq } from 'drizzle-orm';
import { paystackMode, resolveTierPrices } from '../lib/paystack';

const billing = new Hono();

// Tier definitions with pricing.
// priceKES: charges in Kenyan Shillings via Paystack (placeholder conversion
// at ~130 KES/USD rounded to clean numbers — adjust to your real pricing).
export const TIERS = {
  starter: {
    name: 'Starter',
    description: 'For small schools just getting started',
    monthlyPrice: 49,
    annualPrice: 470, // ~$39.17/mo
    priceKES: { monthly: 6_500, annual: 61_000 },
    limits: {
      students: 100,
      staff: 20,
      campuses: 1,
      modules: 3,
    },
    features: [
      'Core pillars (Learner, Teacher, Class, Subject, Term, Assessment, Enrollment)',
      'Up to 3 modules',
      'Basic reporting',
      'Email support',
    ],
  },
  growth: {
    name: 'Growth',
    description: 'For growing schools with expanding needs',
    monthlyPrice: 149,
    annualPrice: 1430, // ~$119.17/mo
    priceKES: { monthly: 19_500, annual: 190_000 },
    limits: {
      students: 500,
      staff: 100,
      campuses: 3,
      modules: 5,
    },
    features: [
      'All Starter features',
      'Up to 5 modules',
      'Advanced analytics',
      'Priority support',
      'Custom branding',
    ],
  },
  institution: {
    name: 'Institution',
    description: 'For established institutions',
    monthlyPrice: 399,
    annualPrice: 3830, // ~$319.17/mo
    priceKES: { monthly: 52_000, annual: 500_000 },
    limits: {
      students: 2000,
      staff: 500,
      campuses: 10,
      modules: 10,
    },
    features: [
      'All Growth features',
      'Up to 10 modules',
      'AI Agent access',
      'Advanced workflows',
      'Phone support',
    ],
  },
  enterprise: {
    name: 'Enterprise',
    description: 'For large organizations with custom needs',
    monthlyPrice: 999,
    annualPrice: 9590, // ~$799.17/mo
    priceKES: { monthly: 130_000, annual: 1_250_000 },
    limits: {
      students: Infinity,
      staff: Infinity,
      campuses: Infinity,
      modules: Infinity,
    },
    features: [
      'All Institution features',
      'Unlimited modules',
      'Dedicated account manager',
      'Custom integrations',
      'SLA guarantee',
    ],
  },
};

// Calculate tier from signals
function calculateTier(signals: {
  studentCount?: number;
  staffCount?: number;
  campusCount?: number;
  moduleCount?: number;
  institutionType?: string;
  establishedYear?: number;
}): string {
  const {
    studentCount = 0,
    staffCount = 0,
    campusCount = 1,
    moduleCount = 0,
    institutionType = 'primary',
  } = signals;

  // Enterprise: large schools or universities
  if (studentCount > 2000 || staffCount > 500 || campusCount > 10) {
    return 'enterprise';
  }
  if (institutionType === 'university' || institutionType === 'tertiary') {
    return 'enterprise';
  }

  // Institution: medium-large schools
  if (studentCount > 500 || staffCount > 100 || campusCount > 3) {
    return 'institution';
  }
  if (moduleCount > 5) {
    return 'institution';
  }

  // Growth: small-medium schools
  if (studentCount > 100 || staffCount > 20 || campusCount > 1) {
    return 'growth';
  }
  if (moduleCount > 3) {
    return 'growth';
  }

  // Starter: small schools
  return 'starter';
}

// Get all tiers — hybrid pricing: Paystack Plans override code prices when reachable
billing.get('/tiers', async (c) => {
  const { tiers, priceSource } = await resolveTierPrices(TIERS);
  return c.json({ mode: paystackMode(), priceSource, tiers });
});

// Get current tier for a school
billing.get('/current', async (c) => {
  const schoolId = c.get('schoolId');

  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
  });

  if (!school) {
    return c.json({ error: 'School not found' }, 404);
  }

  const tierConfig = TIERS[school.tier as keyof typeof TIERS] || TIERS.starter;

  return c.json({
    tier: school.tier,
    config: tierConfig,
    tierSignals: school.tierSignals,
  });
});

// Recalculate tier based on current signals
billing.post('/recalculate', async (c) => {
  const schoolId = c.get('schoolId');

  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
  });

  if (!school) {
    return c.json({ error: 'School not found' }, 404);
  }

  const signals = school.tierSignals as any;
  const newTier = calculateTier(signals);

  // Update tier if changed
  if (newTier !== school.tier) {
    await db.update(schools)
      .set({ tier: newTier })
      .where(eq(schools.id, schoolId));

    return c.json({
      changed: true,
      previousTier: school.tier,
      newTier,
      config: TIERS[newTier as keyof typeof TIERS],
    });
  }

  return c.json({
    changed: false,
    currentTier: school.tier,
    config: TIERS[school.tier as keyof typeof TIERS],
  });
});

// Update tier signals
billing.post('/signals', async (c) => {
  const schoolId = c.get('schoolId');
  const body = await c.req.json();

  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
  });

  if (!school) {
    return c.json({ error: 'School not found' }, 404);
  }

  // Merge signals
  const currentSignals = (school.tierSignals as any) || {};
  const updatedSignals = {
    ...currentSignals,
    ...body,
  };

  // Update signals
  await db.update(schools)
    .set({ tierSignals: updatedSignals })
    .where(eq(schools.id, schoolId));

  // Recalculate tier
  const newTier = calculateTier(updatedSignals);
  const tierChanged = newTier !== school.tier;

  if (tierChanged) {
    await db.update(schools)
      .set({ tier: newTier })
      .where(eq(schools.id, schoolId));
  }

  return c.json({
    success: true,
    signals: updatedSignals,
    tierChanged,
    previousTier: tierChanged ? school.tier : undefined,
    newTier: tierChanged ? newTier : undefined,
  });
});

// Get billing history (mock - would integrate with payment provider)
billing.get('/history', async (c) => {
  const schoolId = c.get('schoolId');

  // In production, this would query a billing_history table
  return c.json({
    invoices: [],
    total: 0,
  });
});

// Get usage within tier limits
billing.get('/usage', async (c) => {
  const schoolId = c.get('schoolId');

  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
  });

  if (!school) {
    return c.json({ error: 'School not found' }, 404);
  }

  const tierConfig = TIERS[school.tier as keyof typeof TIERS] || TIERS.starter;
  const signals = school.tierSignals as any;

  // Calculate usage percentages
  const usage = {
    students: {
      current: signals.studentCount || 0,
      limit: tierConfig.limits.students,
      percentage: tierConfig.limits.students === Infinity
        ? 0
        : ((signals.studentCount || 0) / tierConfig.limits.students) * 100,
    },
    staff: {
      current: signals.staffCount || 0,
      limit: tierConfig.limits.staff,
      percentage: tierConfig.limits.staff === Infinity
        ? 0
        : ((signals.staffCount || 0) / tierConfig.limits.staff) * 100,
    },
    campuses: {
      current: signals.campusCount || 1,
      limit: tierConfig.limits.campuses,
      percentage: tierConfig.limits.campuses === Infinity
        ? 0
        : ((signals.campusCount || 1) / tierConfig.limits.campuses) * 100,
    },
  };

  return c.json({
    tier: school.tier,
    usage,
    limits: tierConfig.limits,
  });
});

// Check if school can add more of a resource
billing.get('/can-add', async (c) => {
  const schoolId = c.get('schoolId');
  const resource = c.req.query('resource'); // students, staff, campuses, modules
  const quantity = parseInt(c.req.query('quantity') || '1');

  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
  });

  if (!school) {
    return c.json({ error: 'School not found' }, 404);
  }

  const tierConfig = TIERS[school.tier as keyof typeof TIERS] || TIERS.starter;
  const signals = school.tierSignals as any;

  let current = 0;
  let limit = 0;

  switch (resource) {
    case 'students':
      current = signals.studentCount || 0;
      limit = tierConfig.limits.students;
      break;
    case 'staff':
      current = signals.staffCount || 0;
      limit = tierConfig.limits.staff;
      break;
    case 'campuses':
      current = signals.campusCount || 1;
      limit = tierConfig.limits.campuses;
      break;
    case 'modules':
      current = signals.moduleCount || 0;
      limit = tierConfig.limits.modules;
      break;
    default:
      return c.json({ error: 'Invalid resource' }, 400);
  }

  const canAdd = limit === Infinity || (current + quantity) <= limit;

  return c.json({
    resource,
    current,
    limit,
    quantity,
    canAdd,
    wouldExceed: !canAdd,
    suggestedTier: canAdd ? null : getSuggestedTierForUpgrade(resource, current + quantity),
  });
});

// Helper to suggest tier upgrade
function getSuggestedTierForUpgrade(resource: string, needed: number): string | null {
  for (const [tierName, tierConfig] of Object.entries(TIERS)) {
    const limit = tierConfig.limits[resource as keyof typeof tierConfig.limits];
    if (limit !== Infinity && needed <= limit) {
      return tierName;
    }
  }
  return null;
}

export default billing;