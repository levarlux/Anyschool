import { neon } from '@neondatabase/serverless';

export async function runMigrations(databaseUrl: string) {
  const sql = neon(databaseUrl);
  
  try {
    // Migration: rename parent_class_id → parent_record_id
    const oldCol = await sql`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'entity_records' AND column_name = 'parent_class_id'
    `;
    
    if (oldCol.length > 0) {
      console.log('[migration] Renaming parent_class_id → parent_record_id...');
      await sql`ALTER TABLE entity_records RENAME COLUMN parent_class_id TO parent_record_id`;
      // Rename old indexes
      try { await sql`ALTER INDEX idx_entity_records_parent_class_id RENAME TO idx_entity_records_parent_record`; } catch {}
      try { await sql`ALTER INDEX idx_entity_records_parent RENAME TO idx_entity_records_parent_record_v2`; } catch {}
      console.log('[migration] Done.');
    }

    // Migration: branding column on schools
    const brandingCols = await sql`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'schools' AND column_name = 'branding'
    `;
    
    if (brandingCols.length === 0) {
      console.log('[migration] Adding branding to schools...');
      await sql`ALTER TABLE schools ADD COLUMN branding jsonb DEFAULT '{}'`;
      console.log('[migration] branding column added.');
    }

    // Migration: tierSignals column on schools
    const tierSignalsCols = await sql`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'schools' AND column_name = 'tier_signals'
    `;
    
    if (tierSignalsCols.length === 0) {
      console.log('[migration] Adding tier_signals to schools...');
      await sql`ALTER TABLE schools ADD COLUMN tier_signals jsonb DEFAULT '{}'`;
      console.log('[migration] tier_signals column added.');
    }

    // Migration: subscriptions + payment_events (Paystack billing)
    await sql`CREATE TABLE IF NOT EXISTS subscriptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id uuid NOT NULL REFERENCES schools(id),
      tier text NOT NULL,
      interval text NOT NULL,
      amount_minor integer NOT NULL,
      currency text NOT NULL DEFAULT 'KES',
      status text NOT NULL DEFAULT 'pending',
      paystack_reference text UNIQUE,
      authorization_url text,
      paid_at timestamptz,
      current_period_start timestamptz,
      current_period_end timestamptz,
      initiated_by text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
    await sql`CREATE INDEX IF NOT EXISTS idx_subscriptions_school_id ON subscriptions(school_id)`;
    await sql`CREATE TABLE IF NOT EXISTS payment_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      reference text NOT NULL,
      event text NOT NULL,
      payload jsonb,
      processed boolean NOT NULL DEFAULT false,
      error text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
    await sql`CREATE INDEX IF NOT EXISTS idx_payment_events_reference ON payment_events(reference)`;

    const clerkOrganizationCols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'schools' AND column_name = 'clerk_organization_id'
    `;

    if (clerkOrganizationCols.length === 0) {
      console.log('[migration] Adding Clerk organization mapping to schools...');
      await sql`ALTER TABLE schools ADD COLUMN clerk_organization_id TEXT`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_schools_clerk_organization_id ON schools(clerk_organization_id) WHERE clerk_organization_id IS NOT NULL`;
      console.log('[migration] Clerk organization mapping added.');
    }
  } catch (e) {
    console.error('[migration] Failed:', e);
  }
}
