// Regression test for sortFieldsByOrder
// Verifies that the photo field is ALWAYS included in the output, even when:
//   - It's not in the saved order
//   - It's marked as hidden in the visibility config
//   - Other fields have been reordered

import { sortFieldsByOrder, getFieldOrder, setFieldOrder, setFieldVisible } from '../lib/fieldOrder.ts';

// Polyfill localStorage for Node
const memStore = {};
globalThis.localStorage = {
  getItem: (k) => memStore[k] ?? null,
  setItem: (k, v) => { memStore[k] = String(v); },
  removeItem: (k) => { delete memStore[k]; },
};

const SCHOOL_ID = 'test-school';
const ENTITY = 'learner';

const photoField = { id: 'f-photo', internalName: 'photo', name: 'Photo', dataType: 'file', fileSubtype: 'image' };
const srgField = { id: 'f-srg', internalName: 'srgshstrh', name: 'srgshstrh', dataType: 'number' };
const statusField = { id: 'f-status', internalName: 'status', name: 'Status', dataType: 'select' };

const allFields = [photoField, srgField, statusField];

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  PASS: ${msg}`); passed++; }
  else { console.error(`  FAIL: ${msg}`); failed++; }
}

console.log('Test 1: Photo field appears in output when no config exists');
{
  const out = sortFieldsByOrder(allFields, ENTITY, SCHOOL_ID);
  assert(out.length === 3, 'returns all 3 fields');
  assert(out.some(f => f.internalName === 'photo'), 'photo field is in output');
}

console.log('Test 2: Photo field is included even when localStorage says it is HIDDEN');
{
  setFieldVisible(ENTITY, SCHOOL_ID, photoField.id, false);
  const out = sortFieldsByOrder(allFields, ENTITY, SCHOOL_ID);
  assert(out.some(f => f.internalName === 'photo'), 'photo is included despite visible=false');
  assert(out.some(f => f.internalName === 'status'), 'status is included (no visibility entry → default visible)');
  assert(out.some(f => f.internalName === 'srgshstrh'), 'srgshstrh is included (no visibility entry → default visible)');
}

console.log('Test 3: Saved order persists with photo at position 1 across "reload"');
{
  // Reset
  delete memStore[`anyschool_field_order_${SCHOOL_ID}_${ENTITY}`];
  // User reorders: [photo, srgshstrh, status]
  setFieldOrder(ENTITY, SCHOOL_ID, [photoField.id, srgField.id, statusField.id]);
  // Simulate reload — call sortFieldsByOrder with fresh fields
  const out = sortFieldsByOrder(allFields, ENTITY, SCHOOL_ID);
  assert(out[0]?.internalName === 'photo', 'photo is at position 0 after reload');
  assert(out[1]?.internalName === 'srgshstrh', 'srgshstrh is at position 1 after reload');
  assert(out[2]?.internalName === 'status', 'status is at position 2 after reload');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
