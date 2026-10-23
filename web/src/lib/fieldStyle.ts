// Field Style — type-based subtle color tinting for field values
// Driven by dataType, not field names. Auto-applies to any field.
// Supports per-field custom color overrides via validationRules.color.

interface FieldStyle {
  bg: string;
  color: string;
  fontWeight?: number;
  fontFamily?: string;
  borderRadius?: number;
  padding?: string;
}

// ─── Preset colors (uniform tintness: bg 8%, text ~65% darkness) ────────────
// Each preset has a carefully matched bg/text pair at the same saturation level.
export const COLOR_PRESETS: Record<string, { label: string; bg: string; text: string }> = {
  default:  { label: 'Default',   bg: '',       text: '' },       // means "use type-based"
  green:    { label: 'Green',     bg: '#f0fdf4', text: '#15803d' },
  blue:     { label: 'Blue',      bg: '#eff6ff', text: '#2563eb' },
  amber:    { label: 'Amber',     bg: '#fffbeb', text: '#b45309' },
  purple:   { label: 'Purple',    bg: '#faf5ff', text: '#7c3aed' },
  red:      { label: 'Red',       bg: '#fef2f2', text: '#dc2626' },
  teal:     { label: 'Teal',      bg: '#f0fdfa', text: '#0d9488' },
  orange:   { label: 'Orange',    bg: '#fff7ed', text: '#ea580c' },
  pink:     { label: 'Pink',      bg: '#fdf2f8', text: '#db2777' },
  slate:    { label: 'Gray',      bg: '#f8fafc', text: '#475569' },
  indigo:   { label: 'Indigo',    bg: '#eef2ff', text: '#4f46e5' },
  cyan:     { label: 'Cyan',      bg: '#ecfeff', text: '#0891b2' },
};

// Generate tint from any hex color (uniform 8% bg opacity, ~65% text darkness)
function hexToTint(hex: string): { bg: string; text: string } {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return {
    bg: `rgba(${r}, ${g}, ${b}, 0.08)`,
    text: `rgb(${Math.round(r * 0.35)}, ${Math.round(g * 0.35)}, ${Math.round(b * 0.35)})`,
  };
}

// ─── Type-based defaults ─────────────────────────────────────────────────────

const TYPE_STYLES: Record<string, FieldStyle> = {
  currency:   { bg: '#f0fdf4', color: '#15803d', fontWeight: 500 },
  number:     { bg: '#f0f9ff', color: '#0369a1', fontWeight: 500 },
  measurement:{ bg: '#f0f9ff', color: '#0369a1', fontWeight: 500 },
  date:       { bg: '#fffbeb', color: '#b45309' },
  time:       { bg: '#fffbeb', color: '#b45309' },
  select:     { bg: '#faf5ff', color: '#7c3aed', fontWeight: 500, borderRadius: 6, padding: '1px 8px' },
  'multi-select': { bg: '#faf5ff', color: '#7c3aed', fontWeight: 500, borderRadius: 6, padding: '1px 8px' },
  boolean:    { bg: '#f0fdf4', color: '#16a34a', fontWeight: 600, borderRadius: 6, padding: '1px 8px' },
  file:       { bg: '#f9fafb', color: '#6b7280' },
  computed:   { bg: '#eff6ff', color: '#2563eb', fontWeight: 500 },
};

// Name-based overrides for text fields (subtle, not hardcoded)
function getNameStyle(internalName: string): FieldStyle | null {
  if (!internalName) return null;
  const n = internalName.toLowerCase();
  if (n.includes('phone') || n.includes('tel')) return { bg: '#f9fafb', color: '#374151', fontFamily: 'monospace' };
  if (n.includes('email')) return { bg: '#fefce8', color: '#a16207', fontFamily: 'monospace' };
  if (n.includes('id') && !n.includes('shadow')) return { bg: '#f9fafb', color: '#374151', fontFamily: 'monospace', fontWeight: 500 };
  if (n.includes('balance') || n.includes('fee') || n.includes('amount') || n.includes('price') || n.includes('cost') || n.includes('revenue') || n.includes('pay'))
    return { bg: '#f0fdf4', color: '#15803d', fontWeight: 500 };
  if (n.includes('rate') || n.includes('percent') || n.includes('ratio'))
    return { bg: '#f0f9ff', color: '#0369a1', fontWeight: 500 };
  return null;
}

// ─── Extract custom color from field metadata ────────────────────────────────
// Color is stored in validationRules.color (hex string like "#2563eb")
function getCustomColor(field: { dataType?: string; internalName?: string; validationRules?: any; options?: any; color?: string }): string | null {
  // Direct color property (from API response)
  if (field.color && typeof field.color === 'string' && field.color.startsWith('#')) {
    return field.color;
  }
  // Nested in validationRules
  const rules = field.validationRules;
  if (rules && typeof rules === 'object' && typeof rules.color === 'string' && rules.color.startsWith('#')) {
    return rules.color;
  }
  return null;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function getFieldStyle(
  dataType: string,
  internalName?: string,
  field?: { validationRules?: any; options?: any; color?: string },
): FieldStyle | null {
  // Check for custom color override
  if (field) {
    const customHex = getCustomColor(field);
    if (customHex) {
      const tint = hexToTint(customHex);
      return {
        bg: tint.bg,
        color: tint.text,
        fontWeight: 500,
        borderRadius: 6,
        padding: '1px 6px',
      };
    }
  }

  // Name-based override first (for text fields that behave like specific types)
  if (dataType === 'text' || dataType === 'select' || dataType === 'multi-select') {
    const nameStyle = getNameStyle(internalName || '');
    if (nameStyle) return nameStyle;
  }
  return TYPE_STYLES[dataType] || null;
}

export function getFieldDisplayStyle(
  dataType: string,
  internalName?: string,
  field?: { validationRules?: any; options?: any; color?: string },
): React.CSSProperties | null {
  const style = getFieldStyle(dataType, internalName, field);
  if (!style) return null;
  return {
    background: style.bg,
    color: style.color,
    fontWeight: style.fontWeight,
    fontFamily: style.fontFamily,
    borderRadius: style.borderRadius ?? 6,
    padding: style.padding ?? '1px 6px',
    display: 'inline-block',
    fontSize: '0.85rem',
  };
}

/** Preview what a custom hex color looks like as a field tint (for color picker) */
export function previewColor(hex: string): { bg: string; text: string } {
  if (!hex) return { bg: '', text: '' };
  return hexToTint(hex);
}
