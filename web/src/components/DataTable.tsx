// DataTable — Reusable auto-sizing table component
// Columns grow/shrink based on content. No fixed column count.
// Used by Learners, Teachers, Classes — any list view.

import { useMemo, useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getFieldDisplayStyle } from '../lib/fieldStyle';
import Avatar from './Avatar';
import { FileText } from 'lucide-react';

function extractFileName(value: any): string {
  if (!value) return '';
  if (typeof value === 'object' && typeof value.name === 'string' && value.name) return value.name;
  const url = typeof value === 'string' ? value : value?.url;
  if (!url) return '';
  try {
    const pathname = new URL(url).pathname;
    const segments = pathname.split('/');
    const last = segments[segments.length - 1];
    return decodeURIComponent(last).split('?')[0] || '';
  } catch {
    return '';
  }
}

// ─── Multi-Value Cell — portal dropdown so it escapes table overflow clipping ───
// Condition A (length === 1): render plain text, no button, no dropdown.
// Condition B (length > 1): render first item + "+N" badge + dropdown trigger.
// Condition C (length === 0): render em-dash fallback.
export function MultiValueDropdown({ names }: { names: string[]; label: string }) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (buttonRef.current && !buttonRef.current.contains(e.target as Node)) setOpen(false);
    };
    const scrollHandler = () => setOpen(false);
    document.addEventListener('mousedown', handler);
    window.addEventListener('scroll', scrollHandler, true);
    return () => {
      document.removeEventListener('mousedown', handler);
      window.removeEventListener('scroll', scrollHandler, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const MENU_MIN_W = 160;
    const viewportW = window.innerWidth;
    let left = rect.left;
    if (left + MENU_MIN_W > viewportW - 8) {
      left = Math.max(8, viewportW - MENU_MIN_W - 8);
    }
    setMenuPos({ top: rect.bottom + 4, left });
  }, [open]);

  // Condition C — empty array
  if (names.length === 0) {
    return <span style={{ color: '#9ca3af' }}>—</span>;
  }

  // Condition A — exactly one item: render as plain text, no dropdown
  if (names.length === 1) {
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', width: '100%', minWidth: 0, overflow: 'hidden', boxSizing: 'border-box' }}>
        <span style={{ fontSize: '0.8rem', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {names[0]}
        </span>
      </div>
    );
  }

  // Condition B — multiple items: first item + dropdown trigger
  const first = names[0];
  const extra = names.length - 1;

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, width: '100%', minWidth: 0, overflow: 'hidden', boxSizing: 'border-box' }}>
      <button
        ref={buttonRef}
        onClick={e => { e.stopPropagation(); e.preventDefault(); setOpen(o => !o); }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '2px 6px', borderRadius: 6, fontSize: '0.78rem',
          background: '#f3e8ff', color: '#7c3aed', border: '1px solid #e9d5ff',
          cursor: 'pointer', fontWeight: 500,
          width: '100%', maxWidth: '100%', boxSizing: 'border-box',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          outline: 'none', flexShrink: 1,
        }}
        title={names.join(', ')}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 auto', minWidth: 0 }}>
          {first}
        </span>
        <span style={{
          background: '#7c3aed', color: '#fff', borderRadius: 4,
          fontSize: '0.6rem', fontWeight: 700, padding: '0 4px',
          flexShrink: 0, lineHeight: '14px', alignSelf: 'center',
        }}>
          +{extra}
        </span>
        <span style={{ fontSize: '0.6rem', flexShrink: 0, alignSelf: 'center' }}>{open ? '\u25B2' : '\u25BC'}</span>
      </button>

      {open && createPortal(
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed', top: menuPos.top, left: menuPos.left,
            zIndex: 99999, background: 'white', borderRadius: 8, border: '1px solid #e5e7eb',
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)', minWidth: 160, maxHeight: 220,
            overflowY: 'auto', padding: 4,
          }}
        >
          {names.map((name, i) => (
            <div key={i} style={{ padding: '6px 10px', fontSize: '0.8rem', color: '#374151', borderRadius: 4, cursor: 'default' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f3f4f6')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {name}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

export interface DataTableField {
  id: string;
  name: string;
  internalName: string;
  dataType: string;
  validationRules?: any;
  color?: string;
  fileSubtype?: string;
}

export interface DataTableProps {
  fields: DataTableField[];
  records: Array<{ id: string; values: Record<string, any>; createdAt?: string; updatedAt?: string }>;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleSelectAll?: () => void;
  onRowClick?: (id: string) => void;
  emptyIcon?: React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyActions?: React.ReactNode;
  /** Extra columns injected by parent (e.g. roster count, relationship badges) */
  extraColumns?: {
    header: React.ReactNode;
    render: (record: any) => React.ReactNode;
    width?: number;
  }[];
  /** Custom cell renderer per field internalName — overrides default rendering */
  cellRenderer?: (field: DataTableField, value: any, record: any) => React.ReactNode;
  /** Action column at the end */
  actions?: React.ReactNode;
  loading?: boolean;
  loadingSkeleton?: React.ReactNode;
}

// Estimate column width based on field type and max content length
function estimateColumnWidth(field: DataTableField, records: Array<{ values: Record<string, any> }>): number {
  // Base widths by type
  const TYPE_BASE: Record<string, number> = {
    boolean: 70,
    date: 100,
    time: 80,
    number: 80,
    currency: 100,
    measurement: 90,
    select: 110,
    'multi-select': 130,
    file: 80,
    relationship: 120,
  };

  const base = TYPE_BASE[field.dataType] || 110;

  // Measure actual content length
  let maxContentLen = field.name.length;
  for (const r of records) {
    const v = r.values?.[field.internalName];
    if (v == null) continue;
    let s: string;
    if (field.dataType === 'relationship') {
      s = String(v); // Linked record name
    } else if (field.dataType === 'file') {
      s = 'File'; // Thumbnail takes fixed width
    } else if (typeof v === 'string' && v.startsWith('data:')) {
      s = 'File';
    } else {
      s = String(v);
    }
    if (s.length > maxContentLen) maxContentLen = s.length;
  }

  // Character width estimate: ~7px per char at 0.85rem font, plus padding
  const contentWidth = Math.ceil(maxContentLen * 7.5) + 32;
  return Math.max(base, Math.min(contentWidth, 280)); // min base, max 280
}

// Parse a value that may be a JSON array string, plain comma-separated string, or already an array
export function parseMultiValue(value: any): string[] | null {
  if (value == null || value === '') return null;
  if (Array.isArray(value)) return value.map(v => String(v ?? ''));
  if (typeof value === 'string') {
    const trimmed = value.trim();
    // Try JSON array first
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map(v => String(v ?? ''));
      } catch { /* fall through */ }
    }
    // Handle plain comma-separated string (e.g., "+254711222333,+254722333444")
    if (trimmed.includes(',')) {
      return trimmed.split(',').map(v => v.trim()).filter(v => v.length > 0);
    }
  }
  return null;
}

export function renderCell(field: DataTableField, value: any, record?: any): React.ReactNode {
  // Handle multi-value arrays for ANY non-boolean field type (except relationship which has its own logic)
  if (field.dataType !== 'relationship' && field.dataType !== 'boolean' && field.dataType !== 'file') {
    const parsed = parseMultiValue(value);
    if (parsed && parsed.length > 0) {
      if (parsed.length === 1) {
        return <span style={{ fontSize: '0.8rem', color: '#374151' }}>{parsed[0]}</span>;
      }
      return <MultiValueDropdown names={parsed} label={String(value)} />;
    }
  }

  // File/image fields: image subtype shows avatar, file/document subtypes show file icon.
  if (field.dataType === 'file') {
    const subType = field.fileSubtype ?? field.validationRules?.fileSubtype ?? null;
    // Show file icon only for explicit file/document subtypes
    if (subType === 'file' || subType === 'document') {
      if (value == null || value === '') return <span style={{ color: '#9ca3af' }}>—</span>;
      const fileName = extractFileName(value);
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, maxWidth: '100%' }} title={fileName || 'File'}>
          <FileText size={14} style={{ color: '#6b7280', flexShrink: 0 }} />
          <span style={{ fontSize: '0.8rem', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
            {fileName || 'File'}
          </span>
        </div>
      );
    }
    // Image subtype (or any other subtype) shows avatar
    const displayName = record?.values?.name || record?.values?.full_name ||
      [record?.values?.first_name, record?.values?.last_name].filter(Boolean).join(' ') ||
      field.name;
    return <Avatar photo={value ?? null} name={displayName} size={28} borderRadius="50%" />;
  }

  // Photo (legacy base64 data URL)
  if (typeof value === 'string' && value.startsWith('data:')) {
    const displayName = record?.values?.name || record?.values?.full_name ||
      [record?.values?.first_name, record?.values?.last_name].filter(Boolean).join(' ') ||
      field.name;
    return <Avatar photo={value} name={displayName} size={28} borderRadius="50%" />;
  }

  if (value == null || value === '') return <span style={{ color: '#9ca3af' }}>—</span>;

  // Relationship field — show name(s) from _names array; dropdown only when > 1 item
  if (field.dataType === 'relationship') {
    const namesKey = `${field.internalName}_names`;
    const names = record?.values?.[namesKey];
    if (Array.isArray(names) && names.length === 1) {
      return <span style={{ fontSize: '0.8rem', color: '#374151' }}>{names[0]}</span>;
    }
    if (Array.isArray(names) && names.length > 1) {
      return <MultiValueDropdown names={names} label={String(value)} />;
    }
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#7c3aed', fontWeight: 500 }}>
        <span style={{ fontSize: '0.7rem' }}>─</span>
        {String(value)}
      </span>
    );
  }

  // Status badge
  if (field.internalName?.includes('status')) {
    const isActive = value === 'Active' || value === 'Enrolled' || value === 'Completed';
    return (
      <span className={`badge ${isActive ? 'badge-success' : 'badge-warning'}`}>
        {value}
      </span>
    );
  }

  // Boolean
  if (field.dataType === 'boolean') {
    return (
      <span className={`badge ${value ? 'badge-success' : 'badge-secondary'}`}>
        {value ? 'Yes' : 'No'}
      </span>
    );
  }

  // Currency with KES prefix
  if (field.dataType === 'currency') {
    const style = getFieldDisplayStyle(field.dataType, field.internalName, field);
    return <span style={{ ...style, fontWeight: 500 }}>KES {Number(value || 0).toLocaleString()}</span>;
  }

  // Type-based subtle color tint
  const style = getFieldDisplayStyle(field.dataType, field.internalName, field);
  if (style) {
    return <span style={style}>{String(value)}</span>;
  }

  return <span>{value}</span>;
}

export default function DataTable({
  fields, records, selectedIds, onToggleSelect, onToggleSelectAll,
  onRowClick, emptyIcon, emptyTitle, emptyDescription, emptyActions,
  extraColumns, cellRenderer, actions, loading, loadingSkeleton,
}: DataTableProps) {
  const tableRef = useRef<HTMLTableElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Measure container width
  useEffect(() => {
    if (!tableRef.current) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) setContainerWidth(entry.contentRect.width);
    });
    observer.observe(tableRef.current.closest('.table-container') || tableRef.current);
    return () => observer.disconnect();
  }, []);

  // Calculate column widths
  const columnWidths = useMemo(() => {
    const CHECKBOX_W = 40;
    const ACTION_W = actions ? 48 : 0;
    const EXTRA_W = (extraColumns || []).reduce((sum, c) => sum + (c.width || 100), 0);
    const available = Math.max(containerWidth - CHECKBOX_W - ACTION_W - EXTRA_W, 400);

    const widths = fields.map(f => estimateColumnWidth(f, records));
    const totalEstimate = widths.reduce((s, w) => s + w, 0);

    // Scale to fit available space
    if (totalEstimate > 0 && totalEstimate < available) {
      const scale = available / totalEstimate;
      return widths.map(w => Math.round(w * scale));
    }
    return widths;
  }, [fields, records, containerWidth, extraColumns, actions]);

  if (loading) return loadingSkeleton ? <>{loadingSkeleton}</> : <div style={{ padding: 20, textAlign: 'center', color: '#9ca3af' }}>Loading...</div>;

  if (records.length === 0) {
    return (
      <div className="empty-state">
        {emptyIcon && <div className="empty-state-icon">{emptyIcon}</div>}
        {emptyTitle && <h3>{emptyTitle}</h3>}
        {emptyDescription && <p>{emptyDescription}</p>}
        {emptyActions && <div className="empty-state-actions">{emptyActions}</div>}
      </div>
    );
  }

  return (
    <div className="table-container" style={{ overflowX: 'auto' }}>
      <table className="data-table" ref={tableRef} style={{ tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: 40 }} />
          <col style={{ width: 36 }} />
          {fields.map((f, i) => (
            <col key={f.id} style={{ width: columnWidths[i] || 120 }} />
          ))}
          {(extraColumns || []).map((c, i) => (
            <col key={`extra-${i}`} style={{ width: c.width || 100 }} />
          ))}
          {actions && <col style={{ width: 48 }} />}
        </colgroup>
        <thead>
          <tr>
            <th>
              {onToggleSelectAll && (
                <input
                  type="checkbox"
                  checked={selectedIds != null && selectedIds.size === records.length && records.length > 0}
                  onChange={onToggleSelectAll}
                  style={{ cursor: 'pointer' }}
                />
              )}
            </th>
            <th style={{ color: '#9ca3af', fontSize: '0.7rem' }}>#</th>
            {fields.map(f => <th key={f.id} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</th>)}
            {(extraColumns || []).map((c, i) => <th key={`extra-${i}`}>{c.header}</th>)}
            {actions && <th></th>}
          </tr>
        </thead>
        <tbody>
          {records.map((record, rowIndex) => (
            <tr key={record.id} className={onRowClick ? 'clickable-row' : ''} onClick={() => onRowClick?.(record.id)}>
              <td onClick={e => e.stopPropagation()}>
                {onToggleSelect && (
                  <input
                    type="checkbox"
                    checked={selectedIds?.has(record.id) || false}
                    onChange={() => onToggleSelect(record.id)}
                    style={{ cursor: 'pointer' }}
                  />
                )}
              </td>
              <td style={{ fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center' }}>{rowIndex + 1}</td>
{fields.map(f => {
                    const custom = cellRenderer?.(f, record.values?.[f.internalName], record);
                    return (
                      <td key={f.id} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {custom !== undefined ? custom : renderCell(f, record.values?.[f.internalName], record)}
                      </td>
                    );
                  })}
              {(extraColumns || []).map((c, i) => (
                <td key={`extra-${i}`}>{c.render(record)}</td>
              ))}
              {actions && <td>{actions}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
