// READ-ONLY diagnostic — replicates the exact queries from GET /api/learners/list/:schoolId
// and measures timings + payload sizes. No writes.
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { neon } from '@neondatabase/serverless';

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '.env') });
const sql = neon(process.env.DATABASE_URL!);
const SCHOOL_ID = '88374870-9175-4565-a876-f17c2e295519';

const ms = (t0: number) => `${Date.now() - t0}ms`;

async function main() {
  // 1. Entity type + learner count (proves whether the 413 records exist)
  let t = Date.now();
  const types = await sql`SELECT id, internal_name FROM entity_types WHERE school_id = ${SCHOOL_ID}`;
  console.log(`\n[1] entity_types for school (${ms(t)}):`, types.map((r: any) => r.internal_name).join(', '));

  const learnerType = types.find((r: any) => r.internal_name === 'learner');
  if (!learnerType) {
    console.log('!! No entity_type with internal_name = "learner" — list endpoint would 404');
    return;
  }

  t = Date.now();
  const cnt = await sql`SELECT COUNT(*)::int AS c FROM entity_records WHERE school_id = ${SCHOOL_ID} AND entity_type_id = ${learnerType.id} AND is_deleted = false`;
  console.log(`[2] learner record count (is_deleted=false): ${cnt[0].c} (${ms(t)})`);

  // 2. Field definitions (cached server-side, cheap)
  t = Date.now();
  const fields = await sql`SELECT id, internal_name, data_type FROM field_definitions WHERE entity_type_id = ${learnerType.id} ORDER BY display_order`;
  console.log(`[3] learner field definitions: ${fields.length} fields (${ms(t)})`);
  console.log('    ', fields.map((f: any) => `${f.internal_name}(${f.data_type})`).join(', '));

  // 3. THE EXACT QUERY the list endpoint runs:
  //    SELECT * FROM field_values WHERE school_id=$1 AND field_definition_id IN (...)
  //    Measure DB-side row count + byte size WITHOUT transferring blobs.
  const fieldIds = fields.map((f: any) => f.id);
  const ph = fieldIds.map((_: any, i: number) => `$${i + 2}`).join(',');
  t = Date.now();
  const sizeRows: any[] = await sql(`
    SELECT
      COUNT(*)::int AS rows,
      COALESCE(SUM(octet_length(COALESCE(text_value,''))),0)::bigint AS text_bytes,
      COALESCE(SUM(octet_length(COALESCE(file_value::text,''))),0)::bigint AS file_bytes,
      COUNT(file_value)::int AS file_rows
    FROM field_values
    WHERE school_id = $1 AND field_definition_id IN (${ph})
  `, [SCHOOL_ID, ...fieldIds]);
  const s = sizeRows[0] as any;
  const mb = (b: string | number) => (Number(b) / 1024 / 1024).toFixed(2) + ' MB';
  console.log(`\n[4] field_values matched by the list endpoint's query (${ms(t)}):`);
  console.log(`     rows=${s.rows}, file rows=${s.file_rows}`);
  console.log(`     text payload: ${mb(s.text_bytes)}`);
  console.log(`     file (base64 photo) payload: ${mb(s.file_bytes)}`);
  console.log(`     TOTAL payload the endpoint must pull from Neon + serialize to JSON: ~${mb(Number(s.text_bytes) + Number(s.file_bytes))}`);

  // 4. Compare: same query but EXCLUDING file_value (what it should do)
  t = Date.now();
  const noFiles: any[] = await sql(`
    SELECT COUNT(*)::int AS rows
    FROM field_values
    WHERE school_id = $1 AND field_definition_id IN (${ph}) AND file_value IS NULL
  `, [SCHOOL_ID, ...fieldIds]);
  console.log(`\n[5] same query excluding photos: ${noFiles[0].rows} rows (${ms(t)}) — this is all the table actually needs`);

  // 5. Compare against teachers (the page that loads fast)
  const teacherType = types.find((r: any) => r.internal_name === 'teacher');
  if (teacherType) {
    t = Date.now();
    const tSize = await sql`
      SELECT COUNT(*)::int AS rows,
             COALESCE(SUM(octet_length(COALESCE(file_value::text,''))),0)::bigint AS file_bytes
      FROM field_values fv
      JOIN entity_records er ON er.id = fv.entity_record_id
      WHERE fv.school_id = ${SCHOOL_ID} AND er.entity_type_id = ${teacherType.id} AND er.is_deleted = false
    `;
    const ts = tSize[0] as any;
    console.log(`\n[6] teachers comparison (${ms(t)}): rows=${ts.rows}, photo payload=${mb(ts.file_bytes)}`);
  }

  // 6. Version endpoint keys (cache staleness check uses versions['learner'])
  t = Date.now();
  const ver = await sql`
    SELECT et.internal_name, COUNT(er.id)::int AS cnt, MAX(er.updated_at) AS last_updated
    FROM entity_records er JOIN entity_types et ON er.entity_type_id = et.id
    WHERE er.school_id = ${SCHOOL_ID} GROUP BY et.internal_name
  `;
  console.log(`\n[7] version endpoint keys (${ms(t)}):`, ver.map((r: any) => `${r.internal_name}=${r.cnt}`).join(', '));
  console.log('     frontend cache staleness looks up versions["learner"] →', ver.some((r: any) => r.internal_name === 'learner') ? 'FOUND (ok)' : 'MISSING → cache considered stale on EVERY load → constant refetch!');
}

main().then(() => process.exit(0)).catch(e => { console.error('Diagnostic failed:', e.message); process.exit(1); });
