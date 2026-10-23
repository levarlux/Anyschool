// ONE-TIME MIGRATION: move base64 data URLs stored in field_values.file_value to R2.
// - Finds every row where the stored url starts with "data:" (object or raw string form).
// - Uploads each to R2 under schools/<schoolId>/photos/<recordId>-<fieldId>.<ext>
// - Updates file_value to { url, name, type, size } JSON.
// - Rows that fail to upload are LEFT UNTOUCHED (still base64) and listed at the end,
//   so this script is safe to re-run (already-migrated rows are skipped).
//
// Usage:  npx tsx migrate-photos-to-r2.ts          (dry-run by default)
//         npx tsx migrate-photos-to-r2.ts --apply  (perform the migration)
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { neon } from '@neondatabase/serverless';
import { r2Configured, dataUrlToR2 } from './src/lib/r2';

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '.env') });
const sql = neon(process.env.DATABASE_URL!);

const APPLY = process.argv.includes('--apply');

async function main() {
  if (!r2Configured()) {
    console.error('R2 is not configured (check R2_* env vars). Aborting.');
    process.exit(1);
  }

  // 1. Count the backlog
  const stat: any = await sql`
    SELECT
      COUNT(*)::int AS total,
      COALESCE(SUM(octet_length(file_value::text)), 0)::bigint AS bytes
    FROM field_values
    WHERE file_value::text LIKE '%"data:%'
       OR file_value::text LIKE 'data:%'
  `;
  console.log(`Rows still holding base64 payloads: ${stat[0].total} (~${(Number(stat[0].bytes) / 1024 / 1024).toFixed(2)} MB)`);

  // 2. Fetch row METADATA only (no blobs — transferring multi-MB payloads in one query
  //    makes Neon HTTP drop the connection). Blobs are fetched one row at a time below.
  const meta: any[] = await sql`
    SELECT fv.id, fv.school_id, fv.entity_record_id, fv.field_definition_id,
           fd.internal_name AS field_name, fd.data_type,
           octet_length(fv.file_value::text) AS blob_bytes
    FROM field_values fv
    LEFT JOIN field_definitions fd ON fd.id = fv.field_definition_id
    WHERE fv.file_value::text LIKE '%"data:%'
       OR fv.file_value::text LIKE 'data:%'
    ORDER BY octet_length(fv.file_value::text) ASC
  `;
  console.log(`Found ${meta.length} rows to migrate. Mode: ${APPLY ? 'APPLY' : 'DRY-RUN (use --apply to write)'}\n`);

  // 3. Fetch each blob individually with retry — small transfers survive Neon flakiness
  const rows: any[] = [];
  for (const m of meta) {
    let fetched: any = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const one: any = await sql`SELECT id, school_id, entity_record_id, field_definition_id, file_value FROM field_values WHERE id = ${m.id}`;
        fetched = one[0];
        break;
      } catch (e: any) {
        console.warn(`  fetch retry ${attempt}/3 for row ${m.id}: ${e.message}`);
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
    if (fetched) rows.push({ ...fetched, field_name: m.field_name, data_type: m.data_type });
    else console.error(`  SKIPPED (unfetchable): row ${m.id} field=${m.field_name}`);
  }

  let migrated = 0, failed = 0, skipped = 0;
  const failures: string[] = [];
  let freedBytes = 0;

  for (const row of rows) {
    const fv: any = row.file_value;
    // Extract the data URL: either { url: "data:..." } object or a raw string
    let dataUrl: string | null = null;
    if (typeof fv === 'string' && fv.startsWith('data:')) dataUrl = fv;
    else if (fv && typeof fv === 'object' && typeof fv.url === 'string' && fv.url.startsWith('data:')) dataUrl = fv.url;

    if (!dataUrl) { skipped++; continue; }

    const beforeBytes = dataUrl.length;
    const label = `record=${row.entity_record_id} field=${row.field_name} (${(beforeBytes / 1024 / 1024).toFixed(2)} MB)`;

    try {
      if (APPLY) {
        const kind = row.field_name === 'photo' ? 'photos' : 'uploads';
        const uploaded = await dataUrlToR2(dataUrl, row.school_id, kind, `${row.entity_record_id.slice(0, 8)}.${(fv?.type || 'image/jpeg').split('/')[1] || 'jpg'}`);
        // Rewrite the DB row — same shape the app expects: { url, name, type, size }
        await sql`
          UPDATE field_values
          SET file_value = ${JSON.stringify({
            url: uploaded.url,
            name: uploaded.name,
            type: uploaded.type,
            size: uploaded.size,
          })}::jsonb
          WHERE id = ${row.id}
        `;
        console.log(`  MIGRATED ${label} -> ${uploaded.url}`);
      } else {
        console.log(`  WOULD MIGRATE ${label}`);
      }
      migrated++;
      freedBytes += beforeBytes;
    } catch (err: any) {
      failed++;
      failures.push(`${label}: ${err.message}`);
      console.error(`  FAILED   ${label}: ${err.message}`);
    }
  }

  console.log(`\nSummary: ${migrated} ${APPLY ? 'migrated' : 'would migrate'}, ${failed} failed, ${skipped} skipped`);
  console.log(`DB payload that would be removed: ~${(freedBytes / 1024 / 1024).toFixed(2)} MB`);
  if (failures.length) {
    console.log('\nFailures (rows left untouched, safe to re-run):');
    for (const f of failures) console.log('  ' + f);
  }
  if (!APPLY) console.log('\nDry run only — re-run with --apply to perform the migration.');
}

main().then(() => process.exit(0)).catch(e => { console.error('Migration failed:', e); process.exit(1); });
