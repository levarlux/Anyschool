// READ-ONLY — isolates WHERE the 25s goes: DB row transfer vs JSON serialization
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { neon } from '@neondatabase/serverless';

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '.env') });
const sql = neon(process.env.DATABASE_URL!);
const SCHOOL_ID = '88374870-9175-4565-a876-f17c2e295519';

async function main() {
  const learnerType: any = (await sql`SELECT id FROM entity_types WHERE school_id = ${SCHOOL_ID} AND internal_name = 'learner'`)[0];
  const fields: any[] = await sql`SELECT id FROM field_definitions WHERE entity_type_id = ${learnerType.id}`;
  const fieldIds = fields.map(f => f.id);
  const ph = fieldIds.map((_, i) => `$${i + 2}`).join(',');

  // EXACT query the endpoint runs (SELECT * — transfers file_value base64 blobs)
  let t = Date.now();
  const allValues: any[] = await sql(
    `SELECT * FROM field_values WHERE school_id = $1 AND field_definition_id IN (${ph})`,
    [SCHOOL_ID, ...fieldIds],
  );
  console.log(`[A] EXACT endpoint query (SELECT * incl. file_value blobs): ${allValues.length} rows in ${Date.now() - t}ms`);

  // Same query excluding file_value — what the endpoint SHOULD select
  t = Date.now();
  const slimValues: any[] = await sql(
    `SELECT school_id, entity_record_id, field_definition_id, text_value, numeric_value, date_value, boolean_value FROM field_values WHERE school_id = $1 AND field_definition_id IN (${ph})`,
    [SCHOOL_ID, ...fieldIds],
  );
  console.log(`[B] same query EXCLUDING file_value column: ${slimValues.length} rows in ${Date.now() - t}ms`);

  // JSON serialization cost of a 4.5MB response
  t = Date.now();
  const big = JSON.stringify({ records: Array.from({ length: 413 }, (_, i) => ({ id: 'r' + i, values: { photo: 'data:image/png;base64,' + 'A'.repeat(1_000_000) } })) });
  console.log(`[C] JSON.stringify ~4MB payload: ${(Date.now() - t) / 1000}s — localStorage (5MB limit) would then REJECT saving this (QuotaExceededError), silently swallowed by saveCache try/catch`);
}
main().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
