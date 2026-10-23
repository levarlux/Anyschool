// DynamicField — Reusable field component that renders the correct input based on field type.
// Supports: text, number, date, time, boolean, select, multi-select, currency, measurement, file
// isMultiple: true — renders array of inputs with "+ Add another" button for any scalar field type.

import { useRef, useState } from 'react';
import { X, Upload } from 'lucide-react';
import Avatar from './Avatar';

// File upload constraints
const IMAGE_ACCEPT = '.jpg,.jpeg,.png,.gif,.webp,.svg,.bmp';
const IMAGE_MAX_SIZE = 5 * 1024 * 1024; // 5MB
const DOC_ACCEPT = '.pdf,.doc,.docx';
const DOC_MAX_SIZE = 10 * 1024 * 1024; // 10MB

function getFileHint(subType: string): string {
  if (subType === 'image') {
    return `Images: JPG, PNG, GIF up to 5MB`;
  }
  return `Documents: PDF, Word up to 10MB`;
}

export interface FieldSchema {
  id?: string;
  name: string;
  internalName: string;
  dataType: string;
  isRequired?: boolean;
  isMultiple?: boolean;
  options?: string[] | null;
  unit?: string | null;
  maxLength?: number | null;
  min?: number | null;
  max?: number | null;
  currency?: string | null;
  placeholder?: string;
  sectionId?: string | null;
  displayOrder?: number;
  fileSubtype?: string | null;
  validationRules?: any;
}

interface Props {
  field: FieldSchema;
  value: any;
  onChange: (value: any) => void;
  disabled?: boolean;
  compact?: boolean;
  style?: React.CSSProperties;
}

const CURRENCIES = [
  { code: 'USD', symbol: '$' }, { code: 'EUR', symbol: '\u20ac' }, { code: 'GBP', symbol: '\u00a3' },
  { code: 'NGN', symbol: 'KSh' }, { code: 'GHS', symbol: 'GH\u20b5' }, { code: 'ZAR', symbol: 'R' },
  { code: 'INR', symbol: '\u20b9' }, { code: 'CNY', symbol: '\u00a5' }, { code: 'JPY', symbol: '\u00a5' },
  { code: 'CAD', symbol: 'CA$' }, { code: 'AUD', symbol: 'A$' }, { code: 'BRL', symbol: 'R$' },
  { code: 'MXN', symbol: 'MX$' }, { code: 'PHP', symbol: '\u20b1' }, { code: 'IDR', symbol: 'Rp' },
  { code: 'MYR', symbol: 'RM' }, { code: 'THB', symbol: '\u0e3f' }, { code: 'AED', symbol: 'AED' },
  { code: 'SAR', symbol: 'SAR' },
];

const TIME_UNITS = ['hr', 'min', 'sec'];

export default function DynamicField({ field, value, onChange, disabled, compact, style }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  const inputStyle: React.CSSProperties = {
    width: '100%', minHeight: compact ? 32 : 36,
    padding: compact ? '6px 10px' : '8px 12px',
    border: '1px solid var(--brand-border)', borderRadius: 6,
    background: 'var(--brand-surface)', color: 'var(--brand-text)',
    fontSize: '0.85rem', lineHeight: 1.4, outline: 'none',
    transition: 'border-color 0.15s', boxSizing: 'border-box' as const,
    minWidth: 0, ...style,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '0.78rem', fontWeight: 500, color: 'var(--brand-text-secondary)',
    marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4,
  };

  const focus = (e: HTMLElement) => { e.style.borderColor = 'var(--brand-primary)'; };
  const blur = (e: HTMLElement) => { e.style.borderColor = 'var(--brand-border)'; };

  const renderLabel = () => (
    <div style={labelStyle}>
      {field.name}{field.isRequired && <span style={{ color: '#ef4444' }}>*</span>}
      {field.maxLength && <span style={{ fontWeight: 400, opacity: 0.6 }}>(max {field.maxLength})</span>}
    </div>
  );

  // ─── Add / Remove row buttons (shared across all multi-value field types) ───
  const renderMultiValueControls = (values: any[], renderRow: (v: any, i: number) => React.ReactNode) => (
    <div>
      {values.map((v, i) => (
        <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4, alignItems: 'flex-start' }}>
          {renderRow(v, i)}
          <button
            type="button"
            onClick={() => onChange(values.filter((_, j) => j !== i))}
            style={{
              padding: '6px 8px', borderRadius: 6, border: '1px solid var(--brand-border)',
              background: 'transparent', color: '#ef4444', cursor: 'pointer',
              fontSize: '1rem', lineHeight: 1, flexShrink: 0, marginTop: compact ? 4 : 6,
            }}
            title="Remove"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...values, ''])}
        style={{
          marginTop: 2, padding: '4px 10px', borderRadius: 6,
          border: '1px dashed var(--brand-border)', background: 'transparent',
          color: 'var(--brand-primary)', cursor: 'pointer', fontSize: '0.78rem',
        }}
      >
        + Add another
      </button>
    </div>
  );

  // ─── Normalize value to array ───────────────────────────────────────────────
  const values: any[] = field.isMultiple
    ? (Array.isArray(value) ? value : [value ?? ''])
    : [value ?? ''];

  // ─── isMultiple — wrap any scalar field type with + Add another / × remove ─
  if (field.isMultiple) {
    // TEXT
    if (field.dataType === 'text') {
      return (
        <div>
          {renderLabel()}
          {renderMultiValueControls(values, (v, i) => (
            <input
              key={i}
              type="text"
              style={inputStyle}
              placeholder={field.placeholder || `Enter ${field.name.toLowerCase()}`}
              value={v ?? ''}
              maxLength={field.maxLength || undefined}
              disabled={disabled}
              onChange={e => {
                const updated = [...values];
                updated[i] = e.target.value;
                onChange(updated);
              }}
              onFocus={e => focus(e.target)}
              onBlur={e => blur(e.target)}
            />
          ))}
        </div>
      );
    }

    // NUMBER
    if (field.dataType === 'number') {
      return (
        <div>
          {renderLabel()}
          {renderMultiValueControls(values, (v, i) => (
            <div key={i} style={{ display: 'flex', gap: 4, flex: 1 }}>
              <input
                type="number"
                style={{ ...inputStyle, flex: 1 }}
                placeholder={field.placeholder || 'Enter number'}
                value={v ?? ''}
                min={field.min ?? undefined}
                max={field.max ?? undefined}
                disabled={disabled}
                onChange={e => {
                  const updated = [...values];
                  updated[i] = e.target.value;
                  onChange(updated);
                }}
                onFocus={e => focus(e.target)}
                onBlur={e => blur(e.target)}
              />
              {field.unit && (
                <span style={{
                  display: 'flex', alignItems: 'center', padding: '0 8px',
                  background: 'var(--brand-bg-secondary, #f1f5f9)',
                  borderRadius: 6, fontSize: '0.78rem', color: 'var(--brand-text-secondary)',
                  whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  {field.unit}
                </span>
              )}
            </div>
          ))}
        </div>
      );
    }

    // DATE
    if (field.dataType === 'date') {
      return (
        <div>
          {renderLabel()}
          {renderMultiValueControls(values, (v, i) => (
            <input
              key={i}
              type="date"
              style={inputStyle}
              value={v ?? ''}
              disabled={disabled}
              onChange={e => {
                const updated = [...values];
                updated[i] = e.target.value;
                onChange(updated);
              }}
              onFocus={e => focus(e.target)}
              onBlur={e => blur(e.target)}
            />
          ))}
        </div>
      );
    }

    // TIME
    if (field.dataType === 'time') {
      return (
        <div>
          {renderLabel()}
          {renderMultiValueControls(values, (v, i) => (
            <div key={i} style={{ display: 'flex', gap: 4, flex: 1 }}>
              <input
                type="time"
                style={{ ...inputStyle, flex: 1 }}
                value={v ?? ''}
                disabled={disabled}
                onChange={e => {
                  const updated = [...values];
                  updated[i] = e.target.value;
                  onChange(updated);
                }}
                onFocus={e => focus(e.target)}
                onBlur={e => blur(e.target)}
              />
              {field.unit && TIME_UNITS.includes(field.unit) && (
                <span style={{
                  display: 'flex', alignItems: 'center', padding: '0 8px',
                  background: 'var(--brand-bg-secondary, #f1f5f9)',
                  borderRadius: 6, fontSize: '0.78rem', color: 'var(--brand-text-secondary)',
                  whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  {field.unit}
                </span>
              )}
            </div>
          ))}
        </div>
      );
    }

    // CURRENCY
    if (field.dataType === 'currency') {
      const currency = CURRENCIES.find(c => c.code === field.currency) || CURRENCIES[0];
      return (
        <div>
          {renderLabel()}
          {renderMultiValueControls(values, (v, i) => (
            <div key={i} style={{ display: 'flex', gap: 4, flex: 1 }}>
              <span style={{
                display: 'flex', alignItems: 'center', padding: '0 10px',
                background: 'var(--brand-bg-secondary, #f1f5f9)',
                borderRadius: 6, fontSize: '0.85rem', color: 'var(--brand-text-secondary)',
                whiteSpace: 'nowrap', fontWeight: 500, flexShrink: 0,
              }}>
                {currency.symbol}
              </span>
              <input
                type="number"
                style={{ ...inputStyle, flex: 1 }}
                placeholder={field.placeholder || '0.00'}
                value={v ?? ''}
                min={0}
                step="0.01"
                disabled={disabled}
                onChange={e => {
                  const updated = [...values];
                  updated[i] = e.target.value;
                  onChange(updated);
                }}
                onFocus={e => focus(e.target)}
                onBlur={e => blur(e.target)}
              />
              <span style={{
                display: 'flex', alignItems: 'center', padding: '0 8px',
                background: 'var(--brand-bg-secondary, #f1f5f9)',
                borderRadius: 6, fontSize: '0.75rem', color: 'var(--brand-text-secondary)',
                whiteSpace: 'nowrap', flexShrink: 0,
              }}>
                {currency.code}
              </span>
            </div>
          ))}
        </div>
      );
    }

    // MEASUREMENT
    if (field.dataType === 'measurement') {
      return (
        <div>
          {renderLabel()}
          {renderMultiValueControls(values, (v, i) => (
            <div key={i} style={{ display: 'flex', gap: 4, flex: 1 }}>
              <input
                type="number"
                style={{ ...inputStyle, flex: 1 }}
                placeholder={field.placeholder || '0'}
                value={v ?? ''}
                min={0}
                disabled={disabled}
                onChange={e => {
                  const updated = [...values];
                  updated[i] = e.target.value;
                  onChange(updated);
                }}
                onFocus={e => focus(e.target)}
                onBlur={e => blur(e.target)}
              />
              {field.unit && (
                <span style={{
                  display: 'flex', alignItems: 'center', padding: '0 8px',
                  background: 'var(--brand-bg-secondary, #f1f5f9)',
                  borderRadius: 6, fontSize: '0.78rem', color: 'var(--brand-text-secondary)',
                  whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  {field.unit}
                </span>
              )}
            </div>
          ))}
        </div>
      );
    }

    // SELECT with isMultiple — render pill/tag multi-select UI (same as multi-select dataType)
    if (field.dataType === 'select') {
      const selected: string[] = Array.isArray(value)
        ? value
        : (typeof value === 'string' && value.startsWith('['))
          ? (() => { try { return JSON.parse(value); } catch { return []; } })()
          : [];
      return (
        <div>
          {renderLabel()}
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 4, padding: '4px 8px',
            border: '1px solid var(--brand-border)', borderRadius: 6,
            background: 'var(--brand-surface)', minHeight: compact ? 32 : 36,
            alignItems: 'center',
          }}>
            {selected.map((v: string) => (
              <span key={v} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '2px 6px', borderRadius: 4,
                background: 'var(--brand-primary)', color: 'white',
                fontSize: '0.75rem', fontWeight: 500,
              }}>
                {v}
                {!disabled && (
                  <X
                    size={10}
                    style={{ cursor: 'pointer' }}
                    onClick={() => onChange(selected.filter((s: string) => s !== v))}
                  />
                )}
              </span>
            ))}
            {!disabled && (
              <select
                style={{
                  ...inputStyle, border: 'none', background: 'transparent',
                  padding: 0, width: 'auto', flex: 1, minWidth: 80,
                }}
                value=""
                onChange={e => {
                  if (e.target.value && !selected.includes(e.target.value)) {
                    onChange([...selected, e.target.value]);
                  }
                  e.target.value = '';
                }}
              >
                <option value="">{selected.length ? '+ Add more' : 'Select...'}</option>
                {(field.options || []).filter((o: string) => !selected.includes(o)).map((opt: string) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      );
    }

    // BOOLEAN multi-value — show one Yes/No toggle per row
    if (field.dataType === 'boolean') {
      const bools: boolean[] = Array.isArray(value) ? value : [value ?? null];
      return (
        <div>
          {renderLabel()}
          {renderMultiValueControls(bools, (v, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, flex: 1 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: disabled ? 'not-allowed' : 'pointer', fontSize: '0.85rem' }}>
                <input
                  type="radio"
                  checked={v === true || v === 'true'}
                  disabled={disabled}
                  onChange={() => {
                    const updated = [...bools];
                    updated[i] = true;
                    onChange(updated);
                  }}
                  style={{ accentColor: 'var(--brand-primary)' }}
                />
                Yes
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: disabled ? 'not-allowed' : 'pointer', fontSize: '0.85rem' }}>
                <input
                  type="radio"
                  checked={v === false || v === 'false'}
                  disabled={disabled}
                  onChange={() => {
                    const updated = [...bools];
                    updated[i] = false;
                    onChange(updated);
                  }}
                  style={{ accentColor: 'var(--brand-primary)' }}
                />
                No
              </label>
            </div>
          ))}
        </div>
      );
    }

    // FILE multi-value — show one file upload per row
    if (field.dataType === 'file') {
      const subType = field.fileSubtype || (field.validationRules as any)?.fileSubtype || 'image';
      const files: string[] = Array.isArray(value) ? value : [value ?? null];
      return (
        <div>
          {renderLabel()}
          {renderMultiValueControls(files, (v, i) => (
            <div key={i} style={{ flex: 1 }}>
              {subType === 'image' ? (
                <Avatar
                  photo={v ?? null}
                  name={`${field.name} ${i + 1}`}
                  size={48}
                  borderRadius="50%"
                  editable={!disabled}
                  onUpload={(file) => {
                    if (file.size > IMAGE_MAX_SIZE) {
                      alert('Image too large. Maximum 5MB.');
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      const updated = [...files];
                      updated[i] = reader.result as string;
                      onChange(updated);
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              ) : (
                <div
                  style={{
                    border: '2px dashed #d1d5db', borderRadius: 8, padding: '12px',
                    textAlign: 'center', cursor: disabled ? 'default' : 'pointer',
                    background: v ? '#f0fdf4' : '#f9fafb',
                    borderColor: v ? '#86efac' : '#d1d5db',
                  }}
                  onClick={() => !disabled && fileRef.current?.click()}
                >
                  <input
                    ref={i === 0 ? fileRef : undefined}
                    type="file"
                    style={{ display: 'none' }}
                    accept={DOC_ACCEPT}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        if (file.size > DOC_MAX_SIZE) {
                          alert('File too large. Maximum 10MB.');
                          return;
                        }
                        const reader = new FileReader();
                        reader.onload = () => {
                          const updated = [...files];
                          updated[i] = reader.result as string;
                          onChange(updated);
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                  {v ? (
                    <div style={{ fontSize: '0.8rem', color: '#374151' }}>{v.startsWith('data:') ? 'Uploaded' : v.split('/').pop()}</div>
                  ) : (
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}><Upload size={16} style={{ margin: '0 auto 4px' }} />Click to upload</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      );
    }

    // Fallback for any other dataType with isMultiple
    return (
      <div>
        {renderLabel()}
        {renderMultiValueControls(values, (v, i) => (
          <input
            key={i}
            type="text"
            style={inputStyle}
            placeholder={field.placeholder || `Enter ${field.name.toLowerCase()}`}
            value={v ?? ''}
            disabled={disabled}
            onChange={e => {
              const updated = [...values];
              updated[i] = e.target.value;
              onChange(updated);
            }}
            onFocus={e => focus(e.target)}
            onBlur={e => blur(e.target)}
          />
        ))}
      </div>
    );
  }

  // ─── SINGLE-VALUE branches (existing logic, unchanged) ──────────────────────

  // TEXT
  if (field.dataType === 'text') {
    return (
      <div>
        {renderLabel()}
        <input
          type="text"
          style={inputStyle}
          placeholder={field.placeholder || `Enter ${field.name.toLowerCase()}`}
          value={value ?? ''}
          maxLength={field.maxLength || undefined}
          disabled={disabled}
          onChange={e => onChange(e.target.value)}
          onFocus={e => focus(e.target)}
          onBlur={e => blur(e.target)}
        />
      </div>
    );
  }

  // NUMBER
  if (field.dataType === 'number') {
    return (
      <div>
        {renderLabel()}
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            type="number"
            style={{ ...inputStyle, flex: 1 }}
            placeholder={field.placeholder || 'Enter number'}
            value={value ?? ''}
            min={field.min ?? undefined}
            max={field.max ?? undefined}
            disabled={disabled}
            onChange={e => onChange(e.target.value)}
            onFocus={e => focus(e.target)}
            onBlur={e => blur(e.target)}
          />
          {field.unit && (
            <span style={{
              display: 'flex', alignItems: 'center', padding: '0 8px',
              background: 'var(--brand-bg-secondary, #f1f5f9)',
              borderRadius: 6, fontSize: '0.78rem', color: 'var(--brand-text-secondary)',
              whiteSpace: 'nowrap',
            }}>
              {field.unit}
            </span>
          )}
        </div>
      </div>
    );
  }

  // DATE
  if (field.dataType === 'date') {
    return (
      <div>
        {renderLabel()}
        <input
          type="date"
          style={inputStyle}
          value={value ?? ''}
          disabled={disabled}
          onChange={e => onChange(e.target.value)}
          onFocus={e => focus(e.target)}
          onBlur={e => blur(e.target)}
        />
      </div>
    );
  }

  // TIME
  if (field.dataType === 'time') {
    return (
      <div>
        {renderLabel()}
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            type="time"
            style={{ ...inputStyle, flex: 1 }}
            value={value ?? ''}
            disabled={disabled}
            onChange={e => onChange(e.target.value)}
            onFocus={e => focus(e.target)}
            onBlur={e => blur(e.target)}
          />
          {field.unit && TIME_UNITS.includes(field.unit) && (
            <span style={{
              display: 'flex', alignItems: 'center', padding: '0 8px',
              background: 'var(--brand-bg-secondary, #f1f5f9)',
              borderRadius: 6, fontSize: '0.78rem', color: 'var(--brand-text-secondary)',
              whiteSpace: 'nowrap',
            }}>
              {field.unit}
            </span>
          )}
        </div>
      </div>
    );
  }

  // BOOLEAN
  if (field.dataType === 'boolean') {
    return (
      <div>
        {renderLabel()}
        <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: disabled ? 'not-allowed' : 'pointer', fontSize: '0.85rem' }}>
            <input
              type="radio"
              name={`field-${field.internalName}`}
              checked={value === true || value === 'true'}
              disabled={disabled}
              onChange={() => onChange(true)}
              style={{ accentColor: 'var(--brand-primary)' }}
            />
            Yes
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: disabled ? 'not-allowed' : 'pointer', fontSize: '0.85rem' }}>
            <input
              type="radio"
              name={`field-${field.internalName}`}
              checked={value === false || value === 'false'}
              disabled={disabled}
              onChange={() => onChange(false)}
              style={{ accentColor: 'var(--brand-primary)' }}
            />
            No
          </label>
          {(value === null || value === undefined || value === '') && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: disabled ? 'not-allowed' : 'pointer', fontSize: '0.85rem', opacity: 0.6 }}>
              <input
                type="radio"
                name={`field-${field.internalName}`}
                checked={true}
                disabled={disabled}
                onChange={() => onChange(null)}
                style={{ accentColor: 'var(--brand-primary)' }}
              />
              Not set
            </label>
          )}
        </div>
      </div>
    );
  }

  // SELECT
  if (field.dataType === 'select') {
    const selectStyle: React.CSSProperties = {
      ...inputStyle,
      appearance: 'none' as const,
      backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%236B7280' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
      backgroundRepeat: 'no-repeat' as const,
      backgroundPosition: 'right 10px center',
      paddingRight: 30, cursor: 'pointer',
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
    };
    return (
      <div>
        {renderLabel()}
        <select
          style={selectStyle}
          value={value ?? ''}
          disabled={disabled}
          onChange={e => onChange(e.target.value)}
          onFocus={e => focus(e.target)}
          onBlur={e => blur(e.target)}
        >
          <option value="">{field.placeholder || `Select ${field.name.toLowerCase()}...`}</option>
          {(field.options || []).map((opt: string) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>
    );
  }

  // MULTI-SELECT
  if (field.dataType === 'multi-select') {
    const selected: string[] = Array.isArray(value) ? value : [];
    return (
      <div>
        {renderLabel()}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 4, padding: '4px 8px',
          border: '1px solid var(--brand-border)', borderRadius: 6,
          background: 'var(--brand-surface)', minHeight: compact ? 32 : 36,
          alignItems: 'center',
        }}>
          {selected.map((v: string) => (
            <span key={v} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 6px', borderRadius: 4,
              background: 'var(--brand-primary)', color: 'white',
              fontSize: '0.75rem', fontWeight: 500,
            }}>
              {v}
              {!disabled && (
                <X size={10} style={{ cursor: 'pointer' }} onClick={() => onChange(selected.filter((s: string) => s !== v))} />
              )}
            </span>
          ))}
          {!disabled && (
            <select
              style={{ ...inputStyle, border: 'none', background: 'transparent', padding: 0, width: 'auto', flex: 1, minWidth: 80 }}
              value=""
              onChange={e => {
                if (e.target.value && !selected.includes(e.target.value)) {
                  onChange([...selected, e.target.value]);
                }
                e.target.value = '';
              }}
            >
              <option value="">{selected.length ? '+ Add more' : 'Select...'}</option>
              {(field.options || []).filter((o: string) => !selected.includes(o)).map((opt: string) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          )}
        </div>
      </div>
    );
  }

  // CURRENCY
  if (field.dataType === 'currency') {
    const currency = CURRENCIES.find(c => c.code === field.currency) || CURRENCIES[0];
    return (
      <div>
        {renderLabel()}
        <div style={{ display: 'flex', gap: 4 }}>
          <span style={{
            display: 'flex', alignItems: 'center', padding: '0 10px',
            background: 'var(--brand-bg-secondary, #f1f5f9)',
            borderRadius: 6, fontSize: '0.85rem', color: 'var(--brand-text-secondary)',
            whiteSpace: 'nowrap', fontWeight: 500,
          }}>
            {currency.symbol}
          </span>
          <input
            type="number"
            style={{ ...inputStyle, flex: 1 }}
            placeholder={field.placeholder || '0.00'}
            value={value ?? ''}
            min={0}
            step="0.01"
            disabled={disabled}
            onChange={e => onChange(e.target.value)}
            onFocus={e => focus(e.target)}
            onBlur={e => blur(e.target)}
          />
          <span style={{
            display: 'flex', alignItems: 'center', padding: '0 8px',
            background: 'var(--brand-bg-secondary, #f1f5f9)',
            borderRadius: 6, fontSize: '0.75rem', color: 'var(--brand-text-secondary)',
            whiteSpace: 'nowrap',
          }}>
            {currency.code}
          </span>
        </div>
      </div>
    );
  }

  // MEASUREMENT
  if (field.dataType === 'measurement') {
    return (
      <div>
        {renderLabel()}
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            type="number"
            style={{ ...inputStyle, flex: 1 }}
            placeholder={field.placeholder || '0'}
            value={value ?? ''}
            min={0}
            disabled={disabled}
            onChange={e => onChange(e.target.value)}
            onFocus={e => focus(e.target)}
            onBlur={e => blur(e.target)}
          />
          {field.unit && (
            <span style={{
              display: 'flex', alignItems: 'center', padding: '0 8px',
              background: 'var(--brand-bg-secondary, #f1f5f9)',
              borderRadius: 6, fontSize: '0.78rem', color: 'var(--brand-text-secondary)',
              whiteSpace: 'nowrap',
            }}>
              {field.unit}
            </span>
          )}
        </div>
      </div>
    );
  }

  // FILE
  if (field.dataType === 'file') {
    const hasValue = value && typeof value === 'string' && value.length > 0;
    const subType = field.fileSubtype || (field.validationRules as any)?.fileSubtype || 'image';
    const [fileError, setFileError] = useState('');

    if (subType === 'file') {
      return (
        <div>
          {renderLabel()}
          <div
            style={{
              border: '2px dashed #d1d5db', borderRadius: 8, padding: '16px 12px',
              textAlign: 'center', cursor: disabled ? 'default' : 'pointer',
              background: hasValue ? '#f0fdf4' : '#f9fafb',
              borderColor: hasValue ? '#86efac' : fileError ? '#ef4444' : '#d1d5db',
              transition: 'all 0.15s',
            }}
            onClick={() => !disabled && fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              style={{ display: 'none' }}
              accept={DOC_ACCEPT}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  if (file.size > DOC_MAX_SIZE) {
                    setFileError('File too large. Maximum 10MB.');
                    return;
                  }
                  setFileError('');
                  const reader = new FileReader();
                  reader.onload = () => onChange(reader.result as string);
                  reader.readAsDataURL(file);
                }
              }}
            />
            {fileError && <div style={{ fontSize: '0.75rem', color: '#ef4444', marginBottom: 4 }}>{fileError}</div>}
            {hasValue ? (
              <>
                <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>&#128196;</div>
                <div style={{ fontSize: '0.8rem', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {value.startsWith('data:') ? 'Uploaded file' : value.split('/').pop() || 'File'}
                </div>
                {!disabled && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onChange(null); }}
                    style={{
                      marginTop: 6, padding: '3px 8px', borderRadius: 4, border: '1px solid #e2e8f0',
                      background: 'white', fontSize: '0.7rem', color: '#ef4444', cursor: 'pointer',
                    }}
                  >
                    Remove
                  </button>
                )}
              </>
            ) : (
              <>
                <Upload size={20} style={{ color: '#9ca3af', margin: '0 auto 4px' }} />
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Click to upload file</div>
                <div style={{ fontSize: '0.65rem', color: '#9ca3af', marginTop: 2 }}>{getFileHint('file')}</div>
              </>
            )}
          </div>
        </div>
      );
    }

    // Image type
    return (
      <div>
        {renderLabel()}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar
            photo={hasValue ? value : null}
            name={field.name}
            size={48}
            borderRadius="50%"
            editable={!disabled}
            onUpload={(file) => {
              if (file.size > IMAGE_MAX_SIZE) {
                alert('Image too large. Maximum 5MB.');
                return;
              }
              const reader = new FileReader();
              reader.onload = () => onChange(reader.result as string);
              reader.readAsDataURL(file);
            }}
          />
          {hasValue && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--brand-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {value.startsWith('data:') ? 'Uploaded file' : value.split('/').pop() || 'File'}
              </span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onChange(null)}
                  style={{
                    padding: '4px 8px', borderRadius: 4, border: '1px solid #e2e8f0',
                    background: 'white', fontSize: '0.75rem', color: '#ef4444', cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  Remove
                </button>
              )}
            </div>
          )}
          {!hasValue && (
            <label style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
              border: '1px dashed var(--brand-border)', borderRadius: 6,
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontSize: '0.8rem', color: 'var(--brand-text-secondary)', transition: 'all 0.15s',
            }}>
              <Upload size={12} />
              <span>Upload</span>
              <input
                type="file"
                accept={IMAGE_ACCEPT}
                style={{ display: 'none' }}
                disabled={disabled}
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > IMAGE_MAX_SIZE) {
                    alert('Image too large. Maximum 5MB.');
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => onChange(reader.result as string);
                  reader.readAsDataURL(file);
                  e.target.value = '';
                }}
              />
            </label>
          )}
        </div>
      </div>
    );
  }

  // FALLBACK
  return (
    <div>
      {renderLabel()}
      <input
        type="text"
        style={inputStyle}
        placeholder={field.placeholder || `Enter ${field.name.toLowerCase()}`}
        value={value ?? ''}
        maxLength={field.maxLength || undefined}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
        onFocus={e => focus(e.target)}
        onBlur={e => blur(e.target)}
      />
    </div>
  );
}
