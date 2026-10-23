import { config } from 'dotenv';
import { resolve } from 'path';
import { neon } from '@neondatabase/serverless';

config({ path: resolve(import.meta.dirname, '..', '.env') });

const sql = neon(process.env.DATABASE_URL);

async function addColumnIfNotExists(table, column, definition) {
  const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${table}`;
  const exists = cols.some(c => c.column_name === column);
  if (!exists) {
    console.log(`Adding ${column} to ${table}...`);
    // Build and execute raw SQL
    const alterSql = `ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`;
    await sql(alterSql);
    console.log(`${column} added`);
  } else {
    console.log(`${column} already exists`);
  }
}

async function migrate() {
  // schools table columns
  await addColumnIfNotExists('schools', 'branding', 'jsonb DEFAULT \'{}\'');
  await addColumnIfNotExists('schools', 'tier_signals', 'jsonb DEFAULT \'{}\'');
  await addColumnIfNotExists('schools', 'tier', 'text DEFAULT \'starter\'');
  await addColumnIfNotExists('schools', 'onboarding_completed', 'boolean DEFAULT false NOT NULL');
  await addColumnIfNotExists('schools', 'onboarding_step', 'text DEFAULT \'welcome\'');
  await addColumnIfNotExists('schools', 'onboarding_data', 'jsonb DEFAULT \'{}\'');

  // entity_records table columns
  await addColumnIfNotExists('entity_records', 'parent_class_id', 'uuid');

  console.log('Migration complete');
}

migrate().catch(console.error);