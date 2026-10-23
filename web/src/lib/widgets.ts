// Reusable Widget System — Type-Aware, Fully Dynamic
// Aggregation logic is driven by field dataType, never by field name.
// Every aggregation choice is validated against the field's declared type at config and render time.

export type ChartType = 'bar' | 'line' | 'pie' | 'donut' | 'number';
export type WidgetSize = 'sm' | 'md' | 'lg';

// All valid aggregation modes — extended with type-specific variants
export type AggregationMode =
  | 'count'            // count all records (no field needed, always valid)
  | 'count_nonempty'   // count records where field has a non-blank value
  | 'count_unique'     // count distinct non-empty values
  | 'count_true'       // count records where boolean field is true
  | 'count_false'      // count records where boolean field is false
  | 'count_zero'       // count records where numeric field is 0 (or missing)
  | 'sum'              // sum of numeric values
  | 'avg'              // average of numeric values (per-record for multi-field)
  | 'avg_across_fields'  // average across fields (multi-field only, legacy behavior)
  | 'median'           // middle value of the numeric values (average of the two middles for even counts)
  | 'rank'             // position of each group ordered by value — ties share a position (1, 2, 2, 4)
  | 'min'              // smallest value (numeric or earliest date)
  | 'max';             // largest value (numeric or latest date)

export interface WidgetConfig {
  id: string;
  type: 'kpi' | 'chart';
  chartType: ChartType;
  title: string;
  dataField: string;           // primary field internalName (empty string for pure count)
  dataFields?: string[];       // multiple fields for multi-field widgets
  groupByField?: string;       // field to group by (for charts)
  aggregation: AggregationMode;
  // Visual
  color: string;
  bgColor: string;
  icon?: string;
  size: WidgetSize;
  hidden: boolean;
  // For KPI only
  prefix?: string;
  suffix?: string;
  /** Optional value filter — count only records whose dataField equals this value (not yet applied by computeKPI) */
  filterValue?: string;
  // For chart only
  chartColors?: string[];
}

// ─── Aggregation-by-Data-Type Mapping (Section 2 of spec) ───────
// Central lookup: which aggregation modes are valid for each field type.
// This is THE source of truth — never hardcode aggregation choices per field name.

interface TypeInfo {
  label: string;
  validAggregations: AggregationMode[];
  isNumeric: boolean;
  isCategorical: boolean;
  isDate: boolean;
}export const TYPE_INFO: Record<string, TypeInfo> = {
  number:       { label: 'Number',       validAggregations: ['count', 'count_nonempty', 'count_unique', 'count_zero', 'sum', 'avg', 'median', 'rank', 'min', 'max'], isNumeric: true,  isCategorical: false, isDate: false },
  currency:     { label: 'Currency',     validAggregations: ['count', 'count_nonempty', 'count_unique', 'count_zero', 'sum', 'avg', 'median', 'rank', 'min', 'max'], isNumeric: true,  isCategorical: false, isDate: false },
  measurement:  { label: 'Measurement',  validAggregations: ['count', 'count_nonempty', 'count_unique', 'count_zero', 'sum', 'avg', 'median', 'rank', 'min', 'max'], isNumeric: true,  isCategorical: false, isDate: false },
  text:         { label: 'Text',         validAggregations: ['count', 'count_nonempty', 'count_unique'],                                isNumeric: false, isCategorical: false, isDate: false },
  date:         { label: 'Date',         validAggregations: ['count', 'count_nonempty', 'count_unique', 'min', 'max'],                 isNumeric: false, isCategorical: false, isDate: true  },
  time:         { label: 'Time',         validAggregations: ['count', 'count_nonempty', 'count_unique', 'min', 'max'],                 isNumeric: false, isCategorical: false, isDate: true  },
  boolean:      { label: 'Boolean',      validAggregations: ['count', 'count_true', 'count_false'],                                    isNumeric: false, isCategorical: true,  isDate: false },
  select:       { label: 'Select',       validAggregations: ['count', 'count_nonempty', 'count_unique'],                               isNumeric: false, isCategorical: true,  isDate: false },
  'multi-select':{ label: 'Multi-Select', validAggregations: ['count', 'count_nonempty', 'count_unique'],                               isNumeric: false, isCategorical: true,  isDate: false },
  file:         { label: 'File',         validAggregations: ['count', 'count_nonempty'],                                                isNumeric: false, isCategorical: false, isDate: false },
  relationship: { label: 'Relationship', validAggregations: ['count', 'count_nonempty', 'count_unique'],                               isNumeric: false, isCategorical: true,  isDate: false },
  computed:     { label: 'Computed',     validAggregations: ['count', 'count_nonempty', 'count_unique', 'count_zero', 'sum', 'avg', 'median', 'rank', 'min', 'max'],   isNumeric: true,  isCategorical: false, isDate: false },
};

// Virtual `__`-prefixed fields injected by list endpoints (roster/relationship counts).
// Type resolution falls back to these when fieldMap has no definition.
const VIRTUAL_FIELD_TYPES: Record<string, string> = {
  __age: 'number',
  __subjects_count: 'number',
  __classes_count: 'number',
  __roster_count: 'number',
  __child_count: 'number',
  __teachers_count: 'number',
};

// Aggregation labels for UI display
export const AGGREGATION_LABELS: Record<AggregationMode, string> = {
  count: 'Count (all records)',
  count_nonempty: 'Count (non-empty)',
  count_unique: 'Count (unique values)',
  count_true: 'Count true',
  count_false: 'Count false',
  count_zero: 'Count (equals zero)',
  sum: 'Sum',
  avg: 'Average (per record)',
  avg_across_fields: 'Average (across fields)',
  median: 'Median',
  rank: 'Rank (1 = highest, ties share)',
  min: 'Min',
  max: 'Max',
};

// ─── Shared numeric helpers (also used by group ranking) ───────

export function medianOf(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Standard competition ranking: ties share a position (1, 2, 2, 4)
export function competitionRank(values: Array<{ id: string; value: number }>): Map<string, number> {
  const sorted = [...values].sort((a, b) => b.value - a.value);
  const ranks = new Map<string, number>();
  let prevValue: number | null = null;
  let prevRank = 0;
  sorted.forEach((entry, i) => {
    const position = prevValue !== null && entry.value === prevValue ? prevRank : i + 1;
    ranks.set(entry.id, position);
    prevValue = entry.value;
    prevRank = position;
  });
  return ranks;
}

// Get valid aggregations for a field's data type
export function getValidAggregations(dataType: string): AggregationMode[] {
  return TYPE_INFO[dataType]?.validAggregations ?? ['count', 'count_nonempty'];
}

// Check if a field type supports multi-field operations
export function supportsMultiField(dataType: string): boolean {
  return TYPE_INFO[dataType]?.isNumeric ?? false;
}

// Check if a field type is suitable for group-by bucketing
export function needsBucketing(dataType: string): boolean {
  return TYPE_INFO[dataType]?.isNumeric || TYPE_INFO[dataType]?.isDate || false;
}

// ─── Constants ──────────────────────────────────────────────────

export const DEFAULT_WIDGET_COLORS = [
  { name: 'Blue', color: '#3b82f6', bg: '#eff6ff' },
  { name: 'Green', color: '#22c55e', bg: '#f0fdf4' },
  { name: 'Purple', color: '#8b5cf6', bg: '#faf5ff' },
  { name: 'Amber', color: '#f59e0b', bg: '#fffbeb' },
  { name: 'Rose', color: '#f43f5e', bg: '#fff1f2' },
  { name: 'Cyan', color: '#06b6d4', bg: '#ecfeff' },
  { name: 'Indigo', color: '#6366f1', bg: '#eef2ff' },
  { name: 'Teal', color: '#14b8a6', bg: '#f0fdfa' },
  { name: 'Orange', color: '#f97316', bg: '#fff7ed' },
  { name: 'Slate', color: '#64748b', bg: '#f8fafc' },
];

export const CHART_PALETTE = [
  '#3b82f6', '#22c55e', '#8b5cf6', '#f59e0b', '#f43f5e',
  '#06b6d4', '#6366f1', '#14b8a6', '#f97316', '#ec4899',
];

// ─── Config Persistence ─────────────────────────────────────────

const STORAGE_KEY = 'anyschool_widgets';
const API = '/api';
const SCHOOL_ID = typeof localStorage !== 'undefined'
  ? localStorage.getItem('anyschool_current_school') || '88374870-9175-4565-a876-f17c2e295519'
  : '88374870-9175-4565-a876-f17c2e295519';

export function loadWidgetConfig(pageKey: string): WidgetConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const all = JSON.parse(raw);
      if (Array.isArray(all[pageKey]) && all[pageKey].length > 0) return all[pageKey];
    }
  } catch {}
  return getDefaultWidgets(pageKey);
}

export async function saveWidgetConfig(pageKey: string, widgets: WidgetConfig[]): Promise<void> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[pageKey] = widgets;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {}
  try {
    const endpoint = pageKey === 'assessments'
      ? `${API}/assessments/widgets/${SCHOOL_ID}`
      : `${API}/learners/widgets/${SCHOOL_ID}`;
    await fetch(endpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ widgets: { [pageKey]: widgets } }),
    });
  } catch {}
}

export async function syncWidgetConfigFromServer(): Promise<void> {
  try {
    const endpoints = [
      `${API}/learners/widgets/${SCHOOL_ID}`,
      `${API}/assessments/widgets/${SCHOOL_ID}`,
    ];
    const raw = localStorage.getItem(STORAGE_KEY);
    const all = raw ? JSON.parse(raw) : {};
    for (const url of endpoints) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          const serverWidgets = data.widgets || {};
          for (const [key, val] of Object.entries(serverWidgets)) {
            if (val) all[key] = val;
          }
        }
      } catch {}
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {}
}

// ─── Virtual Fields ─────────────────────────────────────────────

export function getVirtualFieldValue(record: Record<string, any>, fieldName: string): any {
  const v = record.values || {};
  switch (fieldName) {
    case '__age': {
      if (!v.date_of_birth) return null;
      const dob = new Date(v.date_of_birth);
      const now = new Date();
      let age = now.getFullYear() - dob.getFullYear();
      if (now.getMonth() < dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())) age--;
      return age;
    }
    case '__full_name':
      return [v.first_name, v.middle_name, v.last_name].filter(Boolean).join(' ') || null;
    case '__parent_name':
      return v.parent_name || v.guardian_name || v.father_name || v.mother_name || null;
    default:
      return v[fieldName] ?? null;
  }
}

// Resolve a field value from a record (handles virtual fields and missing fields)
function resolveFieldValue(record: Record<string, any>, field: string): any {
  if (!field) return null;
  if (field.startsWith('__')) return getVirtualFieldValue(record, field);
  return record.values?.[field] ?? null;
}

// Check if a value is "present" (non-null, non-undefined, non-empty-string)
function isPresent(val: any): boolean {
  return val !== undefined && val !== null && val !== '';
}

// ─── Data Computation — Type-Aware ──────────────────────────────

export interface KPIResult {
  value: number | string | null;
  displayValue: string;
  error?: string;
  fieldMissing?: boolean;
}

export function computeKPI(
  records: Record<string, any>[],
  field: string,
  aggregation: AggregationMode,
  prefix?: string,
  dataFields?: string[],
  fieldMap?: Record<string, any>,   // fieldDefinition lookup: internalName → { dataType, ... }
  suffix?: string,
): KPIResult {
  // Empty records → show zero/empty
  if (!records.length) {
    return { value: 0, displayValue: `${prefix || ''}0${suffix || ''}` };
  }

  // Pure count — no field needed
  if (aggregation === 'count') {
    const result = records.length;
    return { value: result, displayValue: `${prefix || ''}${result.toLocaleString()}${suffix || ''}` };
  }

  // Resolve field type for validation (virtual `__` fields use VIRTUAL_FIELD_TYPES)
  const fieldType = fieldMap?.[field]?.dataType ?? VIRTUAL_FIELD_TYPES[field] ?? 'text';

  // Safety: if aggregation isn't valid for this type, fall back to count
  const valid = getValidAggregations(fieldType);
  if (!valid.includes(aggregation)) {
    const result = records.length;
    return {
      value: result,
      displayValue: `${prefix || ''}${result.toLocaleString()}${suffix || ''}`,
      error: `"${AGGREGATION_LABELS[aggregation]}" is not valid for ${TYPE_INFO[fieldType]?.label || fieldType} fields. Showing count instead.`,
    };
  }

  // Check if field exists (non-virtual fields only)
  if (field && !field.startsWith('__') && fieldMap && !fieldMap[field]) {
    return { value: null, displayValue: '—', fieldMissing: true, error: 'Field no longer available' };
  }

  // Multi-field operations (sum, avg, avg_across_fields)
  const fieldsToUse = dataFields && dataFields.length > 1 ? dataFields : [field];
  if (fieldsToUse.length > 1 && (aggregation === 'sum' || aggregation === 'avg' || aggregation === 'avg_across_fields')) {
    return computeMultiFieldKPI(records, fieldsToUse, aggregation, prefix, suffix, fieldMap);
  }

  // Single-field aggregation — extract raw values
  const rawValues = records.map(r => resolveFieldValue(r, field));

  switch (aggregation) {
    // ── Count variants ────────────────────────────────────
    case 'count_nonempty': {
      const result = rawValues.filter(v => isPresent(v)).length;
      return { value: result, displayValue: `${prefix || ''}${result.toLocaleString()}${suffix || ''}` };
    }
    case 'count_unique': {
      const unique = new Set(rawValues.filter(v => isPresent(v)).map(String));
      const result = unique.size;
      return { value: result, displayValue: `${prefix || ''}${result.toLocaleString()}${suffix || ''}` };
    }
    case 'count_true': {
      const result = rawValues.filter(v => v === true || v === 'true' || v === 'True' || v === '1').length;
      return { value: result, displayValue: `${prefix || ''}${result.toLocaleString()}${suffix || ''}` };
    }
    case 'count_false': {
      const result = rawValues.filter(v => v === false || v === 'false' || v === 'False' || v === '0').length;
      return { value: result, displayValue: `${prefix || ''}${result.toLocaleString()}${suffix || ''}` };
    }
    case 'count_zero': {
      const result = rawValues.filter(v => {
        if (v === null || v === undefined || v === '') return true;
        const n = Number(v);
        return !isNaN(n) && n === 0;
      }).length;
      return { value: result, displayValue: `${prefix || ''}${result.toLocaleString()}${suffix || ''}` };
    }

    // ── Numeric aggregations ──────────────────────────────
    case 'sum': {
      const nums = rawValues.filter(v => isPresent(v)).map(Number).filter(n => !isNaN(n));
      const result = nums.reduce((a, b) => a + b, 0);
      return { value: result, displayValue: formatNumericResult(result, 'sum', prefix, suffix) };
    }
    case 'avg': {
      const nums = rawValues.filter(v => isPresent(v)).map(Number).filter(n => !isNaN(n));
      const result = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
      return { value: result, displayValue: formatNumericResult(result, 'avg', prefix, suffix) };
    }
    case 'median': {
      const nums = rawValues.filter(v => isPresent(v)).map(Number).filter(n => !isNaN(n));
      const result = medianOf(nums);
      if (result === null) return { value: 0, displayValue: `${prefix || ''}0${suffix || ''}` };
      return { value: result, displayValue: formatNumericResult(result, 'median', prefix, suffix) };
    }
    case 'rank': {
      // Rank compares groups against each other — a KPI has no group context.
      return {
        value: null,
        displayValue: '—',
        error: 'Rank compares each group against the others. Use it on a chart widget with a group-by field.',
      };
    }
    case 'min': {
      if (TYPE_INFO[fieldType]?.isDate) {
        // Date min → earliest date
        const dates = rawValues.filter(v => isPresent(v)).map(String).sort();
        const result = dates[0] || '';
        return { value: result, displayValue: result ? formatDate(result) : '—' };
      }
      const nums = rawValues.filter(v => isPresent(v)).map(Number).filter(n => !isNaN(n));
      const result = nums.length ? Math.min(...nums) : 0;
      return { value: result, displayValue: formatNumericResult(result, 'min', prefix, suffix) };
    }
    case 'max': {
      if (TYPE_INFO[fieldType]?.isDate) {
        // Date max → latest date
        const dates = rawValues.filter(v => isPresent(v)).map(String).sort();
        const result = dates[dates.length - 1] || '';
        return { value: result, displayValue: result ? formatDate(result) : '—' };
      }
      const nums = rawValues.filter(v => isPresent(v)).map(Number).filter(n => !isNaN(n));
      const result = nums.length ? Math.max(...nums) : 0;
      return { value: result, displayValue: formatNumericResult(result, 'max', prefix, suffix) };
    }

    // Fallback → count
    default: {
      const result = records.length;
      return { value: result, displayValue: `${prefix || ''}${result.toLocaleString()}${suffix || ''}` };
    }
  }
}

// ─── Multi-Field Aggregation (Section 4 of spec) ───────────────

function computeMultiFieldKPI(
  records: Record<string, any>[],
  fields: string[],
  aggregation: AggregationMode,
  prefix?: string,
  suffix?: string,
  fieldMap?: Record<string, any>,
): KPIResult {
  // Validate: all fields must be numeric-compatible
  for (const f of fields) {
    const type = fieldMap?.[f]?.dataType ?? 'text';
    if (!supportsMultiField(type)) {
      return {
        value: null,
        displayValue: '—',
        error: `Cannot combine "${f}" (${TYPE_INFO[type]?.label || type}) with numeric fields.`,
      };
    }
  }

  // Currency safety: check if all currency fields use the same currency
  const currencyFields = fields.filter(f => fieldMap?.[f]?.dataType === 'currency');
  if (currencyFields.length > 1) {
    const currencies = new Set(currencyFields.map(f => fieldMap?.[f]?.unit || ''));
    if (currencies.size > 1) {
      return {
        value: null,
        displayValue: '—',
        error: `Mixing currencies (${[...currencies].join(', ')}). Change fields to use the same currency.`,
      };
    }
  }

  if (aggregation === 'sum') {
    // Sum: sum each field across all records, then add the sums
    const total = fields.reduce((acc, f) => {
      const vals = records.map(r => resolveFieldValue(r, f)).filter(v => isPresent(v)).map(Number).filter(n => !isNaN(n));
      return acc + vals.reduce((a, b) => a + b, 0);
    }, 0);
    return { value: total, displayValue: `${prefix || ''}${Math.round(total).toLocaleString()}${suffix || ''}` };
  }

  if (aggregation === 'avg') {
    // Average per record (new default): for each record, sum selected fields, then average those totals
    const perRecordTotals = records.map(r => {
      return fields.reduce((acc, f) => {
        const v = resolveFieldValue(r, f);
        const n = isPresent(v) ? Number(v) : 0;
        return acc + (isNaN(n) ? 0 : n);
      }, 0);
    });
    const result = perRecordTotals.reduce((a, b) => a + b, 0) / perRecordTotals.length;
    return { value: result, displayValue: `${prefix || ''}${Math.round(result).toLocaleString()}${suffix || ''}` };
  }

  if (aggregation === 'avg_across_fields') {
    // Average across fields (legacy): sum each field independently, divide by field count
    const fieldSums = fields.map(f => {
      const vals = records.map(r => resolveFieldValue(r, f)).filter(v => isPresent(v)).map(Number).filter(n => !isNaN(n));
      return vals.reduce((a, b) => a + b, 0);
    });
    const total = fieldSums.reduce((a, b) => a + b, 0);
    const result = total / fields.length;
    return { value: result, displayValue: `${prefix || ''}${Math.round(result).toLocaleString()}${suffix || ''}` };
  }

  // Fallback
  return { value: 0, displayValue: `${prefix || ''}0${suffix || ''}` };
}

// ─── Chart Data Computation — with Bucketing ────────────────────

export function computeChartData(
  records: Record<string, any>[],
  dataField: string,
  groupByField: string | undefined,
  aggregation: AggregationMode,
  dataFields?: string[],
  fieldMap?: Record<string, any>,
): { data: Array<{ label: string; value: number; color?: string }>; error?: string; fieldMissing?: boolean } {
  if (!records.length) return { data: [] };

  // Check if primary field exists
  if (dataField && fieldMap && !fieldMap[dataField] && !dataField.startsWith('__')) {
    return { data: [], error: `Field "${dataField}" no longer exists`, fieldMissing: true };
  }

  // No groupBy → single total value
  if (!groupByField) {
    const kpi = computeKPI(records, dataField, aggregation, undefined, dataFields, fieldMap);
    return { data: [{ label: 'Total', value: Number(kpi.value) || 0 }], error: kpi.error, fieldMissing: kpi.fieldMissing };
  }

  // Determine groupBy field type for bucketing decisions (virtual fields use VIRTUAL_FIELD_TYPES)
  const groupByType = fieldMap?.[groupByField]?.dataType ?? VIRTUAL_FIELD_TYPES[groupByField] ?? 'text';
  const isVirtual = groupByField.startsWith('__');

  // Build groups — with bucketing for continuous types
  const groups = new Map<string, Record<string, any>[]>();

  if (!isVirtual && TYPE_INFO[groupByType]?.isNumeric) {
    // Numeric field → auto-bucket into ranges
    const rawValues = records.map(r => resolveFieldValue(r, groupByField))
      .filter(v => isPresent(v))
      .map(Number)
      .filter(n => !isNaN(n));

    if (rawValues.length === 0) return { data: [] };

    const min = Math.min(...rawValues);
    const max = Math.max(...rawValues);
    const buckets = computeNumericBuckets(min, max, 6); // ~6 buckets

    for (const record of records) {
      const val = resolveFieldValue(record, groupByField);
      const num = isPresent(val) ? Number(val) : NaN;
      const bucket = isNaN(num) ? 'Unknown' : findBucket(num, buckets);
      if (!groups.has(bucket)) groups.set(bucket, []);
      groups.get(bucket)!.push(record);
    }
  } else if (!isVirtual && TYPE_INFO[groupByType]?.isDate) {
    // Date field → bucket by month
    const groupsByMonth = new Map<string, Record<string, any>[]>();
    for (const record of records) {
      const val = resolveFieldValue(record, groupByField);
      if (!isPresent(val)) {
        const key = 'Unknown';
        if (!groupsByMonth.has(key)) groupsByMonth.set(key, []);
        groupsByMonth.get(key)!.push(record);
        continue;
      }
      const d = new Date(String(val));
      if (isNaN(d.getTime())) {
        const key = 'Unknown';
        if (!groupsByMonth.has(key)) groupsByMonth.set(key, []);
        groupsByMonth.get(key)!.push(record);
        continue;
      }
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!groupsByMonth.has(key)) groupsByMonth.set(key, []);
      groupsByMonth.get(key)!.push(record);
    }
    // Sort by month key
    const sorted = [...groupsByMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [k, v] of sorted) groups.set(k, v);
  } else {
    // Categorical / text / boolean → group by exact value
    for (const record of records) {
      const val = isVirtual ? getVirtualFieldValue(record, groupByField) : record.values?.[groupByField];
      const key = isPresent(val) ? String(val) : 'Unknown';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(record);
    }
  }

  // Rank: order the groups by their average value, then emit competition
  // ranks (ties share a position — 1, 2, 2, 4). 1 = best.
  if (aggregation === 'rank') {
    const groupValues: Array<{ id: string; label: string; value: number }> = [];
    for (const [label, groupRecords] of groups) {
      const kpi = computeKPI(groupRecords, dataField, 'avg', undefined, undefined, fieldMap);
      const numVal = typeof kpi.value === 'number' ? kpi.value : parseFloat(String(kpi.value));
      if (!isNaN(numVal)) groupValues.push({ id: label, label, value: numVal });
    }
    const ranks = competitionRank(groupValues.map(g => ({ id: g.id, value: g.value })));
    const result = groupValues
      .map(g => ({ label: g.label, value: ranks.get(g.id) || 0 }))
      .sort((a, b) => a.value - b.value || a.label.localeCompare(b.label));
    return { data: result };
  }

  // Compute aggregation per group
  const result: Array<{ label: string; value: number }> = [];
  for (const [label, groupRecords] of groups) {
    const kpi = computeKPI(groupRecords, dataField, aggregation, undefined, undefined, fieldMap);
    const numVal = typeof kpi.value === 'number' ? kpi.value : parseFloat(String(kpi.value));
    if (!isNaN(numVal)) {
      result.push({ label, value: numVal });
    }
  }

  // Sort: for date-bucketed labels (YYYY-MM), sort chronologically; otherwise by value desc
  if (!isVirtual && TYPE_INFO[groupByType]?.isDate) {
    result.sort((a, b) => a.label.localeCompare(b.label));
  } else {
    result.sort((a, b) => b.value - a.value);
  }

  return { data: result };
}

// ─── Numeric Bucketing ──────────────────────────────────────────

interface NumericBucket {
  min: number;
  max: number;
  label: string;
}

function computeNumericBuckets(min: number, max: number, targetCount: number): NumericBucket[] {
  if (min === max) return [{ min: min - 1, max: max + 1, label: `${min}` }];

  const range = max - min;
  // Nice step sizes: 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000...
  const rawStep = range / targetCount;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;
  let step: number;
  if (normalized <= 1.5) step = 1 * magnitude;
  else if (normalized <= 3.5) step = 2 * magnitude;
  else if (normalized <= 7.5) step = 5 * magnitude;
  else step = 10 * magnitude;

  const buckets: NumericBucket[] = [];
  let bucketMin = Math.floor(min / step) * step;
  while (bucketMin < max) {
    const bucketMax = bucketMin + step;
    const lo = bucketMin === Math.floor(min / step) * step ? min : bucketMin;
    const hi = bucketMax > max ? max : bucketMin + step;
    const label = step >= 1
      ? `${Math.round(bucketMin)}–${Math.round(bucketMin + step)}`
      : `${bucketMin.toFixed(1)}–${(bucketMin + step).toFixed(1)}`;
    buckets.push({ min: lo, max: hi, label });
    bucketMin = bucketMax;
  }

  return buckets;
}

function findBucket(value: number, buckets: NumericBucket[]): string {
  for (const b of buckets) {
    if (value >= b.min && value < b.max) return b.label;
  }
  // Edge case: value equals max of last bucket
  if (buckets.length > 0) return buckets[buckets.length - 1].label;
  return String(value);
}

// ─── Display Formatting ─────────────────────────────────────────

function formatNumericResult(value: number, _agg: string, prefix?: string, suffix?: string): string {
  const formatted = Math.abs(value) >= 1000
    ? Math.round(value).toLocaleString()
    : value % 1 === 0
      ? value.toLocaleString()
      : value.toFixed(1);
  return `${prefix || ''}${formatted}${suffix || ''}`;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

// ─── Smart Field Suggestions — Type-Driven ──────────────────────

const BAD_GROUP_FIELDS = new Set([
  'email', 'address', 'phone', 'guardian_phone', 'notes', 'medical_notes',
  'student_id', 'id_number', 'photo', 'passport_photo', 'avatar',
  'created_at', 'updated_at',
]);

export function getFieldSuggestions(
  purpose: string,
  _widgetType: 'kpi' | 'chart',
  allFields: any[],
): any[] {
  // For group-by on charts: show fields suitable for grouping
  if (purpose === 'group') {
    const suggested = allFields.filter(f =>
      !BAD_GROUP_FIELDS.has(f.internalName) &&
      f.dataType !== 'file' &&
      f.dataType !== 'text'
    );
    const computed = [
      { id: '__age', name: 'Age (computed)', internalName: '__age', dataType: 'computed' },
      { id: '__full_name', name: 'Full Name', internalName: '__full_name', dataType: 'computed' },
      { id: '__parent_name', name: 'Parent/Guardian', internalName: '__parent_name', dataType: 'computed' },
    ];
    return [...suggested, ...computed];
  }

  // For a specific aggregation: show only fields whose type supports it
  if (purpose && AGGREGATION_LABELS[purpose as AggregationMode]) {
    return allFields.filter(f => {
      const valid = getValidAggregations(f.dataType);
      return valid.includes(purpose as AggregationMode);
    });
  }

  // For multi-field mode: show only numeric-compatible fields
  if (purpose === 'multi_field') {
    return allFields.filter(f => supportsMultiField(f.dataType));
  }

  // Default: show all non-file, non-photo fields
  return allFields.filter(f => f.dataType !== 'file' && f.internalName !== 'photo');
}

// Get aggregation options filtered by a specific field's type
export function getAggregationOptionsForField(dataType: string): Array<{ value: AggregationMode; label: string }> {
  const valid = getValidAggregations(dataType);
  return valid.map(v => ({ value: v, label: AGGREGATION_LABELS[v] }));
}

// ─── Default Widgets ────────────────────────────────────────────

function getDefaultWidgets(pageKey: string): WidgetConfig[] {
  if (pageKey === 'learners') {
    return [
      { id: 'kpi-total', type: 'kpi', chartType: 'number', title: 'Total Learners', dataField: '', aggregation: 'count', color: '#3b82f6', bgColor: '#eff6ff', size: 'md', hidden: false },
      { id: 'kpi-active', type: 'kpi', chartType: 'number', title: 'Active', dataField: 'status', aggregation: 'count_nonempty', color: '#22c55e', bgColor: '#f0fdf4', size: 'md', hidden: false },
      { id: 'kpi-balance', type: 'kpi', chartType: 'number', title: 'Total Fee Balance', dataField: 'fee_balance', aggregation: 'sum', color: '#f59e0b', bgColor: '#fffbeb', size: 'md', hidden: false, prefix: 'KES ' },
      { id: 'chart-gender', type: 'chart', chartType: 'donut', title: 'By Gender', dataField: '', groupByField: 'gender', aggregation: 'count', color: '#8b5cf6', bgColor: '#faf5ff', size: 'md', hidden: false, chartColors: ['#6366f1', '#ec4899', '#94a3b8'] },
      { id: 'chart-status', type: 'chart', chartType: 'bar', title: 'By Status', dataField: '', groupByField: 'status', aggregation: 'count', color: '#06b6d4', bgColor: '#ecfeff', size: 'md', hidden: false, chartColors: ['#22c55e', '#f59e0b', '#64748b'] },
      { id: 'chart-fees', type: 'chart', chartType: 'bar', title: 'Fee Balance Distribution', dataField: 'fee_balance', groupByField: 'status', aggregation: 'sum', color: '#f43f5e', bgColor: '#fff1f2', size: 'md', hidden: false, prefix: 'KES ', chartColors: ['#3b82f6', '#f59e0b', '#ef4444'] },
    ];
  }
  if (pageKey === 'terms') {
    return [
      { id: 'kpi-total', type: 'kpi', chartType: 'number', title: 'Total Terms', dataField: '', aggregation: 'count', color: '#7c3aed', bgColor: '#faf5ff', size: 'md', hidden: false },
      { id: 'kpi-active', type: 'kpi', chartType: 'number', title: 'Active Terms', dataField: 'status', aggregation: 'count_nonempty', color: '#16a34a', bgColor: '#dcfce7', size: 'md', hidden: false, filterValue: 'Active' },
      { id: 'kpi-children', type: 'kpi', chartType: 'number', title: 'With Children', dataField: '', aggregation: 'count', color: '#2563eb', bgColor: '#dbeafe', size: 'md', hidden: false },
      { id: 'chart-status', type: 'chart', chartType: 'donut', title: 'By Status', dataField: '', groupByField: 'status', aggregation: 'count', color: '#7c3aed', bgColor: '#faf5ff', size: 'md', hidden: false, chartColors: ['#16a34a', '#6b7280', '#2563eb'] },
      { id: 'chart-year', type: 'chart', chartType: 'bar', title: 'By Academic Year', dataField: '', groupByField: 'academic_year', aggregation: 'count', color: '#06b6d4', bgColor: '#ecfeff', size: 'md', hidden: false, chartColors: ['#7c3aed', '#3b82f6', '#06b6d4'] },
    ];
  }
  if (pageKey === 'assessments') {
    return [
      { id: 'kpi-total', type: 'kpi', chartType: 'number', title: 'Total Assessments', dataField: '', aggregation: 'count', color: '#ec4899', bgColor: '#fdf2f8', size: 'md', hidden: false },
      { id: 'kpi-graded', type: 'kpi', chartType: 'number', title: 'Graded', dataField: 'status', aggregation: 'count_nonempty', color: '#8b5cf6', bgColor: '#faf5ff', size: 'md', hidden: false, filterValue: 'Graded' },
      { id: 'kpi-max-score', type: 'kpi', chartType: 'number', title: 'Avg Max Score', dataField: 'max_score', aggregation: 'avg', color: '#f59e0b', bgColor: '#fffbeb', size: 'md', hidden: false },
      { id: 'chart-status', type: 'chart', chartType: 'donut', title: 'By Status', dataField: '', groupByField: 'status', aggregation: 'count', color: '#ec4899', bgColor: '#fdf2f8', size: 'md', hidden: false, chartColors: ['#22c55e', '#f59e0b', '#8b5cf6'] },
      { id: 'chart-type', type: 'chart', chartType: 'bar', title: 'By Type', dataField: '', groupByField: 'type', aggregation: 'count', color: '#06b6d4', bgColor: '#ecfeff', size: 'md', hidden: false, chartColors: ['#ec4899', '#8b5cf6', '#f59e0b'] },
    ];
  }
  if (pageKey === 'teachers') {
    return [
      { id: 'kpi-total', type: 'kpi', chartType: 'number', title: 'Total Teachers', dataField: '', aggregation: 'count', color: '#f59e0b', bgColor: '#fffbeb', size: 'md', hidden: false },
      { id: 'kpi-no-subjects', type: 'kpi', chartType: 'number', title: 'No Subject Assigned', dataField: '__subjects_count', aggregation: 'count_zero', color: '#ef4444', bgColor: '#fef2f2', size: 'md', hidden: false },
      { id: 'kpi-avg-subjects', type: 'kpi', chartType: 'number', title: 'Avg Subjects per Teacher', dataField: '__subjects_count', aggregation: 'avg', color: '#8b5cf6', bgColor: '#faf5ff', size: 'md', hidden: false },
      { id: 'chart-department', type: 'chart', chartType: 'donut', title: 'By Department', dataField: '', groupByField: 'department', aggregation: 'count', color: '#06b6d4', bgColor: '#ecfeff', size: 'md', hidden: false, chartColors: ['#3b82f6', '#22c55e', '#8b5cf6', '#f59e0b', '#f43f5e', '#06b6d4'] },
    ];
  }
  if (pageKey === 'classes') {
    return [
      { id: 'kpi-total', type: 'kpi', chartType: 'number', title: 'Total Classes', dataField: '', aggregation: 'count', color: '#3b82f6', bgColor: '#eff6ff', size: 'md', hidden: false },
      { id: 'kpi-no-teacher', type: 'kpi', chartType: 'number', title: 'Without Teacher', dataField: '__teachers_count', aggregation: 'count_zero', color: '#ef4444', bgColor: '#fef2f2', size: 'md', hidden: false },
      { id: 'kpi-avg-size', type: 'kpi', chartType: 'number', title: 'Avg Class Size', dataField: '__roster_count', aggregation: 'avg', color: '#22c55e', bgColor: '#f0fdf4', size: 'md', hidden: false },
      { id: 'chart-grade', type: 'chart', chartType: 'bar', title: 'By Grade Level', dataField: '', groupByField: 'grade_level', aggregation: 'count', color: '#8b5cf6', bgColor: '#faf5ff', size: 'md', hidden: false, chartColors: ['#3b82f6', '#8b5cf6', '#06b6d4'] },
    ];
  }
  return [];
}

export function generateWidgetId(): string {
  return 'w-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
}
