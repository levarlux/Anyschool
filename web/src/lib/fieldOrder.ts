// Field Order & Visibility — persist drag-to-reorder + hide/show across detail ↔ list views
// Stored in localStorage per entity type.

const PREFIX = 'anyschool_field_order';

interface FieldConfig {
  order: string[];
  visible: Record<string, boolean>; // fieldId → true = visible in list, false = hidden
}

function readConfig(entityType: string, schoolId: string): FieldConfig | null {
  try {
    const raw = localStorage.getItem(`${PREFIX}_${schoolId}_${entityType}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Backwards compat: if it's a plain array, convert to new format
    if (Array.isArray(parsed)) return { order: parsed, visible: {} };
    return parsed;
  } catch { return null; }
}

function writeConfig(entityType: string, schoolId: string, config: FieldConfig): void {
  localStorage.setItem(`${PREFIX}_${schoolId}_${entityType}`, JSON.stringify(config));
}

export function getFieldOrder(entityType: string, schoolId: string): string[] | null {
  return readConfig(entityType, schoolId)?.order ?? null;
}

export function setFieldOrder(entityType: string, schoolId: string, orderedIds: string[]): void {
  const existing = readConfig(entityType, schoolId);
  writeConfig(entityType, schoolId, { order: orderedIds, visible: existing?.visible ?? {} });
}

export function isFieldVisible(entityType: string, schoolId: string, fieldId: string): boolean {
  const config = readConfig(entityType, schoolId);
  if (!config) return true; // default: all visible
  if (config.visible[fieldId] !== undefined) return config.visible[fieldId];
  return true; // default: visible
}

export function setFieldVisible(entityType: string, schoolId: string, fieldId: string, visible: boolean): void {
  const config = readConfig(entityType, schoolId) || { order: [], visible: {} };
  config.visible[fieldId] = visible;
  writeConfig(entityType, schoolId, config);
}

// Get a version number that changes whenever visibility config changes
// This can be used as a useMemo dependency to force recalculation
export function getVisibilityVersion(entityType: string, schoolId: string): string {
  const config = readConfig(entityType, schoolId);
  if (!config) return '0';
  return JSON.stringify(config.visible);
}

/** Sort fields by saved order AND filter to only visible fields.
 * The 'photo' field is always included (it's the system-managed avatar field). */
export function sortFieldsByOrder(fields: any[], entityType: string, schoolId: string): any[] {
  const config = readConfig(entityType, schoolId);
  const order = config?.order ?? null;
  const visible = config?.visible ?? {};

  // Filter to visible fields only (if any visibility config exists).
  // The photo field is NEVER filtered out — it's the system avatar field.
  const hasVisibilityConfig = Object.keys(visible).length > 0;
  const filtered = hasVisibilityConfig
    ? fields.filter(f => f.internalName === 'photo' || visible[f.id] !== false)
    : fields;

  if (!order || order.length === 0) return filtered;
  const map = new Map(filtered.map(f => [f.id, f]));
  const sorted: any[] = [];
  for (const id of order) {
    const f = map.get(id);
    if (f) { sorted.push(f); map.delete(id); }
  }
  for (const f of map.values()) sorted.push(f);
  return sorted;
}

/** Sort fields by saved order only - does NOT filter hidden fields.
 * Use for FieldManager so hidden fields are still visible for un-hiding. */
export function sortFieldsByOrderOnly(fields: any[], entityType: string, schoolId: string): any[] {
  const config = readConfig(entityType, schoolId);
  const order = config?.order ?? null;

  if (!order || order.length === 0) return fields;
  const map = new Map(fields.map(f => [f.id, f]));
  const sorted: any[] = [];
  for (const id of order) {
    const f = map.get(id);
    if (f) { sorted.push(f); map.delete(id); }
  }
  for (const f of map.values()) sorted.push(f);
  return sorted;
}
