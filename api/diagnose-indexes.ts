// READ-ONLY — check whether the performance-index migrations were applied
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { neon } from '@neondatabase/serverless';

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '.env') });
const sql = neon(process.env.DATABASE_URL!);

const idx: any[] = await sql`
  SELECT tablename, indexname FROM pg_indexes
  WHERE tablename IN ('field_values','entity_records','relationship_records')
  ORDER BY tablename, indexname
`;
console.log('Indexes present:');
for (const r of idx) console.log(`  ${r.tablename}: ${r.indexname}`);

const expected = [
  'idx_field_values_school_record',
  'idx_field_values_field_record',
  'idx_entity_records_school_type_deleted',
  'idx_entity_records_parent_class_id',
  'idx_entity_records_parent',
];
console.log('\nExpected performance indexes:');
for (const e of expected) {
  const found = idx.some((r: any) => r.indexname === e);
  console.log(`  ${found ? 'OK ' : 'MISSING'} ${e}`);
}
process.exit(0);
