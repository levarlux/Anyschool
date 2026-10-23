// Field Manager — add, rename, remove custom fields with full type configuration
// State is owned by the parent via useEntityFields hook. This component is purely
// presentational — every mutation calls onLocalFieldsChange so the hook's orderedFields
// (sortFieldsByOrder reading from localStorage) is always the single source of truth.

import { useState, useRef } from 'react';
import { Plus, Trash2, Edit3, X, Check, GripVertical, Eye, EyeOff, Palette, Link, AlertCircle, CheckCircle, ArrowUp, ArrowDown } from 'lucide-react';
import ASSpinner from './ASSpinner';
import TagInput from './TagInput';
import { useConfirm } from './ConfirmProvider';
import { setFieldOrder, isFieldVisible, setFieldVisible } from '../lib/fieldOrder';
import { COLOR_PRESETS, previewColor } from '../lib/fieldStyle';

const SCHOOL_ID = localStorage.getItem('anyschool_current_school') || '88374870-9175-4565-a876-f17c2e295519';

const DRAG_THRESHOLD = 5;

const ENTITY_API_MAP: Record<string, string> = {
  learner: 'learners',
  teacher: 'teachers',
  class: 'classes',
  subject: 'subjects',
  term: 'terms',
  assessment: 'assessments',
  enrollment: 'schema',
};

function getEntityApiBase(entityType: string): string {
  const prefix = ENTITY_API_MAP[entityType] || 'learners';
  if (prefix === 'schema') return `/api/schema`;
  return `/api/${prefix}`;
}

interface Props {
  fields: any[];
  entityType: string;
  onFieldsChanged: () => void;
  onLocalFieldsChange?: (newFields: any[]) => void;
  onVisibilityChanged?: () => void;
}

const FIELD_TYPES = [
  { value: 'text', label: 'Text', icon: 'Aa' },
  { value: 'number', label: 'Number', icon: '#' },
  { value: 'date', label: 'Date', icon: '\ud83d\udcc5' },
  { value: 'time', label: 'Time', icon: '\ud83d\udd52' },
  { value: 'boolean', label: 'Yes/No', icon: '\u2714' },
  { value: 'select', label: 'Dropdown', icon: '\u25bc' },
  { value: 'multi-select', label: 'Multi-Select', icon: '\u2611' },
  { value: 'currency', label: 'Money/Currency', icon: '$' },
  { value: 'measurement', label: 'Measurement', icon: '\u2696' },
  { value: 'file', label: 'File/Image', icon: '\ud83d\udcc4' },
];

const FILE_SUBTYPES = [
  { value: 'image', label: 'Image', icon: '\ud83d\uddbc', description: 'Photo/avatar — shows as circle in tables' },
  { value: 'file', label: 'File', icon: '\ud83d\udcc4', description: 'Document/upload — shows as file icon' },
];

const UNITS = {
  number: ['', 'kg', 'g', 'mg', 'lb', 'oz', 'l', 'ml', 'cm', 'm', 'km', 'mm', 'in', 'ft', 'm/s', 'km/h', 'mph', '%', 'pts', 'hrs'],
  time: ['hr', 'min', 'sec', 'days', 'weeks', 'months'],
  measurement: ['kg', 'g', 'mg', 'lb', 'oz', 'l', 'ml', 'cm', 'm', 'km', 'mm', 'in', 'ft', '\u00b0C', '\u00b0F'],
  currency: ['USD', 'EUR', 'GBP', 'NGN', 'KES', 'GHS', 'ZAR', 'INR', 'CNY', 'JPY', 'CAD', 'AUD', 'BRL', 'MXN', 'PHP', 'IDR', 'MYR', 'THB', 'AED', 'SAR'],
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '\u20ac', GBP: '\u00a3', NGN: '\u20a6', KES: 'KSh', GHS: 'GH\u20b5',
  ZAR: 'R', INR: '\u20b9', CNY: '\u00a5', JPY: '\u00a5', CAD: 'CA$', AUD: 'A$',
  BRL: 'R$', MXN: 'MX$', PHP: '\u20b1', IDR: 'Rp', MYR: 'RM', THB: '\u0e3f', AED: 'AED', SAR: 'SAR',
};

export default function FieldManager({ fields, entityType, onFieldsChanged, onLocalFieldsChange, onVisibilityChanged }: Props) {
  const { confirm } = useConfirm();
  const [show, setShow] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const itemHeight = useRef(0);
  const dragStartY = useRef(0);
  const dragStartIdx = useRef<number | null>(null);

  // FieldManager uses the `fields` prop directly — it is already sorted by the hook's
  // orderedFields (which calls sortFieldsByOrder reading from localStorage).
  // There is no internal "override" state.

  const [newColor, setNewColor] = useState('default');
  const [newCustomHex, setNewCustomHex] = useState('');
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('text');
  const [newFileSubtype, setNewFileSubtype] = useState<'image' | 'file'>('image');
  const [newOptions, setNewOptions] = useState<string[]>([]);
  const [newRequired, setNewRequired] = useState(false);
  const [newUnit, setNewUnit] = useState('');
  const [newCurrency, setNewCurrency] = useState('USD');
  const [newMaxLength, setNewMaxLength] = useState('');
  const [newMin, setNewMin] = useState('');
  const [newMax, setNewMax] = useState('');
  const [editName, setEditName] = useState('');

  const resetForm = () => {
    setNewName(''); setNewType('text'); setNewFileSubtype('image'); setNewOptions([]);
    setNewRequired(false); setNewUnit(''); setNewCurrency('USD');
    setNewMaxLength(''); setNewMin(''); setNewMax(''); setNewColor('default'); setNewCustomHex('');
  };

  const getIndexFromY = (y: number) => {
    if (!listRef.current) return 0;
    const rect = listRef.current.getBoundingClientRect();
    const relativeY = y - rect.top + listRef.current.scrollTop;
    return Math.max(0, Math.min(fields.length - 1, Math.floor(relativeY / itemHeight.current)));
  };

  const handlePointerDown = (e: React.PointerEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragStartY.current = e.clientY;
    dragStartIdx.current = index;
    setDragIdx(index);
    setOverIdx(index);
    setDragActive(false);
    const children = listRef.current?.children;
    if (children && children.length > 0) {
      let totalHeight = 0;
      for (let i = 0; i < children.length; i++) {
        totalHeight += (children[i] as HTMLElement).offsetHeight + 4;
      }
      itemHeight.current = totalHeight / children.length;
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (dragIdx === null) return;
    if (!dragActive) {
      const dy = Math.abs(e.clientY - dragStartY.current);
      if (dy < DRAG_THRESHOLD) return;
      setDragActive(true);
    }
    setOverIdx(getIndexFromY(e.clientY));
  };

  const handlePointerUp = () => {
    if (dragIdx === null) {
      setDragIdx(null); setOverIdx(null); setDragActive(false);
      return;
    }
    if (!dragActive || overIdx === null || dragIdx === overIdx) {
      setDragIdx(null); setOverIdx(null); setDragActive(false);
      return;
    }
    const newFields = [...fields];
    const dragged = newFields.splice(dragIdx, 1)[0];
    newFields.splice(overIdx, 0, dragged);
    setFieldOrder(entityType, SCHOOL_ID, newFields.map(f => f.id));
    if (onLocalFieldsChange) onLocalFieldsChange(newFields);
    onVisibilityChanged?.();
    setDragIdx(null); setOverIdx(null); setDragActive(false);
  };

  const moveField = (fromIndex: number, direction: 'up' | 'down') => {
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= fields.length) return;
    const newFields = [...fields];
    const temp = newFields[fromIndex];
    newFields[fromIndex] = newFields[toIndex];
    newFields[toIndex] = temp;
    setFieldOrder(entityType, SCHOOL_ID, newFields.map(f => f.id));
    if (onLocalFieldsChange) onLocalFieldsChange(newFields);
    onVisibilityChanged?.();
  };

  const toggleVisibility = (fieldId: string) => {
    const current = isFieldVisible(entityType, SCHOOL_ID, fieldId);
    setFieldVisible(entityType, SCHOOL_ID, fieldId, !current);
    if (onVisibilityChanged) onVisibilityChanged();
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const body: any = {
        name: newName,
        dataType: newType,
        isRequired: newRequired,
      };
      if (newType === 'select' || newType === 'multi-select') {
        body.options = newOptions;
      }
      if (newType === 'currency') {
        body.unit = newCurrency;
      } else if (newUnit) {
        body.unit = newUnit;
      }
      if (newType === 'text' && newMaxLength) {
        body.maxLength = parseInt(newMaxLength);
      }
      if (newType === 'number' || newType === 'measurement') {
        if (newMin) body.min = parseFloat(newMin);
        if (newMax) body.max = parseFloat(newMax);
      }
      const effectiveColor = newCustomHex.trim() || (newColor !== 'default' ? newColor : '');
      if (effectiveColor) {
        body.color = effectiveColor;
      }
      if (newType === 'file') {
        body.fileSubtype = newFileSubtype;
      }

      const apiBase = getEntityApiBase(entityType);
      const res = await fetch(`${apiBase}/fields/${SCHOOL_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const newField = await res.json().catch(() => null);
        resetForm();
        setAdding(false);
        setSuccess('Field created');
        setTimeout(() => setSuccess(''), 2000);
        // Optimistic: add to local state immediately, parent re-renders via hook
        if (newField && onLocalFieldsChange) {
          const flatField = {
            ...newField,
            fileSubtype: newField.fileSubtype ?? newField.validationRules?.fileSubtype ?? null,
            maxLength: newField.maxLength ?? newField.validationRules?.maxLength ?? null,
            min: newField.min ?? newField.validationRules?.min ?? null,
            max: newField.max ?? newField.validationRules?.max ?? null,
          };
          onLocalFieldsChange([...fields, flatField]);
        }
        onFieldsChanged();
        onVisibilityChanged?.();
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || `Failed to create field (${res.status})`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error — check your connection');
    }
    setSaving(false);
  };

  const handleRename = async (fieldId: string) => {
    if (!editName.trim()) return;
    setSaving(true);
    setError('');
    try {
      const apiBase = getEntityApiBase(entityType);
      const res = await fetch(`${apiBase}/fields/${SCHOOL_ID}/${fieldId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName }),
      });
      if (res.ok) {
        setEditingId(null);
        if (onLocalFieldsChange) {
          onLocalFieldsChange(fields.map(f => f.id === fieldId ? { ...f, name: editName } : f));
        }
        onFieldsChanged();
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || `Failed to rename field (${res.status})`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error — check your connection');
    }
    setSaving(false);
  };

  const handleDelete = async (fieldId: string) => {
    const ok = await confirm({
      title: 'Delete Field',
      message: 'Delete this field? All data in this field will be lost.',
      confirmText: 'Delete',
      variant: 'destructive',
    });
    if (!ok) return;
    setDeletingId(fieldId);
    setError('');
    try {
      const apiBase = getEntityApiBase(entityType);
      const res = await fetch(`${apiBase}/fields/${SCHOOL_ID}/${fieldId}`, { method: 'DELETE' });
      if (res.ok) {
        setSuccess('Field deleted');
        setTimeout(() => setSuccess(''), 2000);
        const updated = fields.filter(f => f.id !== fieldId);
        setFieldOrder(entityType, SCHOOL_ID, updated.map(f => f.id));
        if (onLocalFieldsChange) onLocalFieldsChange(updated);
        onFieldsChanged();
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || `Failed to delete field (${res.status})`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error — check your connection');
    }
    setDeletingId(null);
  };

  const getTypeInfo = (type: string) => FIELD_TYPES.find(t => t.value === type) || FIELD_TYPES[0];

  const renderTypeSpecificConfig = () => {
    if (newType === 'select' || newType === 'multi-select') {
      return (
        <div style={{ gridColumn: 'span 2', marginTop: 4 }}>
          <label style={labelStyle}>Options</label>
          <TagInput
            value={newOptions}
            onChange={setNewOptions}
            placeholder="Type an option, press comma or Enter..."
          />
        </div>
      );
    }
    if (newType === 'number' || newType === 'measurement') {
      const unitOptions = newType === 'number' ? UNITS.number : UNITS.measurement;
      const isCustomUnit = newUnit && !unitOptions.includes(newUnit);
      return (
        <>
          <div>
            <label style={labelStyle}>Unit (optional)</label>
            <div style={{ display: 'flex', gap: 4 }}>
              <select
                className="select"
                value={isCustomUnit ? '__custom__' : newUnit}
                onChange={e => { setNewUnit(e.target.value === '__custom__' ? '' : e.target.value); }}
                style={{ flex: 1, fontSize: '0.8rem', minWidth: 0 }}
              >
                <option value="">None</option>
                {unitOptions.map(u => <option key={u} value={u}>{u}</option>)}
                <option value="__custom__">+ Custom unit...</option>
              </select>
            </div>
            {(isCustomUnit || (newUnit === '' && !unitOptions.includes(newUnit))) && (
              <input
                className="input"
                placeholder="Type custom unit (e.g. reps, sets, BPM)"
                value={newUnit}
                onChange={e => setNewUnit(e.target.value)}
                style={{ fontSize: '0.8rem', marginTop: 4 }}
              />
            )}
          </div>
          <div>
            <label style={labelStyle}>Min (optional)</label>
            <input className="input" type="number" placeholder="No min" value={newMin} onChange={e => setNewMin(e.target.value)} style={{ fontSize: '0.8rem' }} />
          </div>
          <div>
            <label style={labelStyle}>Max (optional)</label>
            <input className="input" type="number" placeholder="No max" value={newMax} onChange={e => setNewMax(e.target.value)} style={{ fontSize: '0.8rem' }} />
          </div>
        </>
      );
    }
    if (newType === 'currency') {
      return (
        <div>
          <label style={labelStyle}>Currency</label>
          <select className="select" value={newCurrency} onChange={e => setNewCurrency(e.target.value)} style={{ fontSize: '0.8rem' }}>
            {UNITS.currency.map(c => (
              <option key={c} value={c}>{CURRENCY_SYMBOLS[c]} {c}</option>
            ))}
          </select>
        </div>
      );
    }
    if (newType === 'time') {
      const isCustomTime = newUnit && !UNITS.time.includes(newUnit);
      return (
        <div>
          <label style={labelStyle}>Time Unit</label>
          <select
            className="select"
            value={isCustomTime ? '__custom__' : newUnit}
            onChange={e => { setNewUnit(e.target.value === '__custom__' ? '' : e.target.value); }}
            style={{ flex: 1, fontSize: '0.8rem', minWidth: 0 }}
          >
            {UNITS.time.map(u => <option key={u} value={u}>{u}</option>)}
            <option value="__custom__">+ Custom...</option>
          </select>
          {isCustomTime && (
            <input
              className="input"
              placeholder="Type custom time unit (e.g. fortnight, semester)"
              value={newUnit}
              onChange={e => setNewUnit(e.target.value)}
              style={{ fontSize: '0.8rem', marginTop: 4 }}
            />
          )}
        </div>
      );
    }
    if (newType === 'text') {
      return (
        <div>
          <label style={labelStyle}>Max Characters (optional)</label>
          <input className="input" type="number" placeholder="No limit" value={newMaxLength} onChange={e => setNewMaxLength(e.target.value)} min={1} style={{ fontSize: '0.8rem' }} />
        </div>
      );
    }
    if (newType === 'file') {
      return (
        <div style={{ gridColumn: 'span 2', marginTop: 4 }}>
          <label style={labelStyle}>File Type</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {FILE_SUBTYPES.map(st => (
              <button
                key={st.value}
                type="button"
                onClick={() => setNewFileSubtype(st.value as 'image' | 'file')}
                style={{
                  flex: 1, padding: '8px 10px', borderRadius: 6, fontSize: '0.78rem',
                  border: newFileSubtype === st.value ? '1.5px solid var(--brand-primary)' : '1px solid #e5e7eb',
                  background: newFileSubtype === st.value ? 'var(--brand-surface)' : '#fff',
                  color: newFileSubtype === st.value ? 'var(--brand-primary)' : '#6b7280',
                  cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s',
                }}
              >
                <div style={{ fontSize: '1.1rem', marginBottom: 2 }}>{st.icon}</div>
                <div style={{ fontWeight: 600 }}>{st.label}</div>
                <div style={{ fontSize: '0.65rem', color: '#9ca3af', marginTop: 2 }}>{st.description}</div>
              </button>
            ))}
          </div>
        </div>
      );
    }
    return null;
  };

  if (!show) {
    return (
      <button className="btn btn-ghost" onClick={() => setShow(true)} style={{ fontSize: '0.8rem', color: 'var(--brand-text-secondary)' }}>
        <Edit3 size={13} /> Manage Fields
      </button>
    );
  }

  return (
    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h4 style={{ fontSize: '0.85rem', fontWeight: 600 }}>{entityType.charAt(0).toUpperCase() + entityType.slice(1)} Fields</h4>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-primary" onClick={() => setAdding(true)} style={{ fontSize: '0.75rem' }}>
            <Plus size={12} /> Add Field
          </button>
          <button className="btn btn-ghost" onClick={() => setShow(false)} style={{ fontSize: '0.75rem' }}>
            <X size={12} /> Close
          </button>
        </div>
      </div>

      {adding && (
        <div className="card" style={{ padding: 12, marginBottom: 12, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={labelStyle}>Field Name</label>
              <input className="input" placeholder="e.g. Gender, Fee Amount" value={newName} onChange={e => setNewName(e.target.value)} style={{ fontSize: '0.8rem' }} />
            </div>
            <div>
              <label style={labelStyle}>Field Type</label>
              <select className="select" value={newType} onChange={e => { setNewType(e.target.value); setNewUnit(''); }} style={{ fontSize: '0.8rem' }}>
                {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
              </select>
            </div>
            {renderTypeSpecificConfig()}
            <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: 16, marginTop: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={newRequired} onChange={e => setNewRequired(e.target.checked)} style={{ accentColor: 'var(--brand-primary)' }} />
                Required field
              </label>
            </div>
            <div style={{ gridColumn: 'span 2', marginTop: 4 }}>
              <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Palette size={11} /> Color
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                {Object.entries(COLOR_PRESETS).map(([key, preset]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { setNewColor(key); setNewCustomHex(''); }}
                    title={preset.label}
                    style={{
                      width: 24, height: 24, borderRadius: 6,
                      border: newColor === key && !newCustomHex ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                      background: key === 'default' ? 'linear-gradient(135deg, #f0fdf4 50%, #eff6ff 50%)' : preset.bg,
                      cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0,
                    }}
                  />
                ))}
                <input
                  type="color"
                  value={newCustomHex || '#6366f1'}
                  onChange={e => { setNewCustomHex(e.target.value); setNewColor('default'); }}
                  title="Custom color"
                  style={{ width: 24, height: 24, borderRadius: 6, border: newCustomHex ? '2px solid #3b82f6' : '1px solid #e5e7eb', cursor: 'pointer', padding: 0, flexShrink: 0 }}
                />
              </div>
              {(newCustomHex || newColor !== 'default') && (
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    display: 'inline-block', padding: '2px 10px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 500,
                    ...(newCustomHex
                      ? { background: previewColor(newCustomHex).bg, color: previewColor(newCustomHex).text }
                      : {}),
                  }}>
                    Preview
                  </span>
                  <button type="button" onClick={() => { setNewColor('default'); setNewCustomHex(''); }}
                    style={{ fontSize: '0.7rem', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    Reset to default
                  </button>
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <button className="btn btn-primary" onClick={handleCreate} disabled={saving || !newName.trim()} style={{ fontSize: '0.75rem' }}>
              {saving ? <ASSpinner size="sm" /> : <><Check size={12} /> Create</>}
            </button>
            <button className="btn btn-secondary" onClick={() => { setAdding(false); resetForm(); }} style={{ fontSize: '0.75rem' }}>Cancel</button>
          </div>
        </div>
      )}

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 6, background: '#fef2f2', border: '1px solid #fecaca', fontSize: '0.8rem', color: '#dc2626' }}>
          <AlertCircle size={13} /> {error}
          <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}>
            <X size={12} />
          </button>
        </div>
      )}
      {success && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 6, background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: '0.8rem', color: '#16a34a' }}>
          <CheckCircle size={13} /> {success}
        </div>
      )}

      <div ref={listRef} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}
        style={{ display: 'flex', flexDirection: 'column', gap: 4, touchAction: 'none', userSelect: 'none' }}>
        {fields.map((f, index) => {
          const isSystem = f.internalName === 'photo';
          const isRel = f.dataType === 'relationship' || isSystem;
          const ti = isSystem ? { icon: '🖼', label: 'Image' } : isRel ? { icon: null, label: 'Relationship' } : getTypeInfo(f.dataType);
          const isDragging = dragIdx === index;
          const isOver = overIdx === index && dragActive && dragIdx !== null && dragIdx !== index;
          const visible = isFieldVisible(entityType, SCHOOL_ID, f.id);
          return (
            <div
              key={f.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                borderRadius: 6, border: isDragging ? '1.5px solid #3b82f6' : isOver ? '1.5px dashed #3b82f6' : isRel ? '1px solid #e0e7ff' : '1px solid var(--brand-border-light)',
                background: isDragging ? '#eff6ff' : isOver ? '#dbeafe' : isRel ? '#f5f3ff' : '',
                cursor: dragActive ? (isDragging ? 'grabbing' : 'default') : 'default',
                transition: isDragging ? 'none' : 'all 0.15s ease',
                transform: isDragging ? 'scale(1.02) rotate(1deg)' : 'scale(1)',
                boxShadow: isDragging ? '0 8px 24px rgba(59,130,246,0.2)' : 'none',
                opacity: dragActive && !isDragging ? 0.6 : (visible ? 1 : 0.5),
                position: 'relative', zIndex: isDragging ? 10 : 1,
                pointerEvents: dragActive && !isDragging ? 'none' : 'auto',
              }}
            >
              {isOver && (
                <div style={{ position: 'absolute', top: -3, left: 8, right: 8, height: 2, background: '#3b82f6', borderRadius: 1 }} />
              )}
              <GripVertical size={14} onPointerDown={e => handlePointerDown(e, index)}
                style={{ color: isDragging ? '#3b82f6' : '#9ca3af', flexShrink: 0, cursor: dragActive ? 'grabbing' : 'grab', touchAction: 'none' }} />
              {isRel ? (
                <span style={{ width: 24, height: 24, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ede9fe', color: '#7c3aed', flexShrink: 0 }}>
                  <Link size={12} />
                </span>
              ) : (
                <span style={{
                  width: 24, height: 24, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.7rem', fontWeight: 600,
                  background: f.dataType === 'number' ? '#dbeafe' : f.dataType === 'date' ? '#fef3c7' : f.dataType === 'select' ? '#ede9fe' :
                    f.dataType === 'currency' ? '#d1fae5' : f.dataType === 'boolean' ? '#fce7f3' : f.dataType === 'file' ? '#fef3c7' : '#f1f5f9',
                  color: f.dataType === 'number' ? '#2563eb' : f.dataType === 'date' ? '#d97706' : f.dataType === 'select' ? '#7c3aed' :
                    f.dataType === 'currency' ? '#059669' : f.dataType === 'boolean' ? '#db2777' : f.dataType === 'file' ? '#92400e' : '#64748b',
                  flexShrink: 0,
                }}>
                  {ti.icon}
                </span>
              )}
              {editingId === f.id && !isRel ? (
                <>
                  <input className="input" value={editName} onChange={e => setEditName(e.target.value)}
                    style={{ flex: 1, height: 28, fontSize: '0.8rem' }}
                    onKeyDown={e => { if (e.key === 'Enter') handleRename(f.id); if (e.key === 'Escape') setEditingId(null); }} />
                  <button className="btn btn-ghost btn-icon" onClick={() => handleRename(f.id)} style={{ width: 24, height: 24, color: '#22c55e' }}><Check size={12} /></button>
                  <button className="btn btn-ghost btn-icon" onClick={() => setEditingId(null)} style={{ width: 24, height: 24 }}><X size={12} /></button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: '0.85rem' }}>{f.name}</span>
                  {!isRel && (() => {
                    const customColor = f.validationRules?.color || f.color;
                    if (customColor && typeof customColor === 'string') {
                      return <span title={`Custom color: ${customColor}`} style={{ width: 8, height: 8, borderRadius: '50%', background: customColor, flexShrink: 0, border: '1px solid rgba(0,0,0,0.1)' }} />;
                    }
                    return null;
                  })()}
                  <span style={{ fontSize: '0.7rem', color: isRel ? '#7c3aed' : '#9ca3af' }}>
                    {isRel
                      ? `${f._targetEntityDisplayName || 'Linked'} ${f._cardinality === 'many-many' ? '(many-to-many)' : f._cardinality === '1-many' ? '(one-to-many)' : ''}`
                      : <>{ti.label}{f.isRequired ? ' *' : ''}{f.unit ? ` (${f.unit})` : ''}{f.maxLength ? ` [${f.maxLength}]` : ''}
                      {f.options && Array.isArray(f.options) ? ` [${f.options.length} opts]` : ''}</>
                    }
                  </span>
                  <button className="btn btn-ghost btn-icon" onClick={() => toggleVisibility(f.id)}
                    style={{ width: 24, height: 24, color: visible ? '#3b82f6' : '#9ca3af', pointerEvents: 'auto' }}
                    title={visible ? 'Visible in table — click to hide' : 'Hidden from table — click to show'}>
                    {visible ? <Eye size={11} /> : <EyeOff size={11} />}
                  </button>
                  <button onClick={() => moveField(index, 'up')} disabled={index === 0}
                    style={{
                      width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: 4, border: 'none', background: 'transparent', cursor: index === 0 ? 'not-allowed' : 'pointer',
                      color: index === 0 ? '#d1d5db' : '#6b7280', pointerEvents: 'auto', opacity: index === 0 ? 0.4 : 1,
                      padding: 0, flexShrink: 0,
                    }}
                    title="Move up">
                    <ArrowUp size={14} />
                  </button>
                  <button onClick={() => moveField(index, 'down')} disabled={index === fields.length - 1}
                    style={{
                      width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: 4, border: 'none', background: 'transparent', cursor: index === fields.length - 1 ? 'not-allowed' : 'pointer',
                      color: index === fields.length - 1 ? '#d1d5db' : '#6b7280', pointerEvents: 'auto', opacity: index === fields.length - 1 ? 0.4 : 1,
                      padding: 0, flexShrink: 0,
                    }}
                    title="Move down">
                    <ArrowDown size={14} />
                  </button>
                  {!isRel && <button className="btn btn-ghost btn-icon" onClick={() => { setEditingId(f.id); setEditName(f.name); }}
                    style={{ width: 24, height: 24, pointerEvents: 'auto' }}><Edit3 size={11} /></button>}
                  {!isRel && <button className="btn btn-ghost btn-icon" onClick={() => handleDelete(f.id)} disabled={deletingId === f.id}
                    style={{ width: 24, height: 24, color: '#ef4444', pointerEvents: 'auto' }}>
                    {deletingId === f.id ? <ASSpinner size="sm" /> : <Trash2 size={11} />}
                  </button>}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  fontWeight: 500,
  color: '#64748b',
  marginBottom: 2,
  display: 'block',
};
