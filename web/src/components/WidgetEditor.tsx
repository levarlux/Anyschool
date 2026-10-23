// Widget Editor — Type-Aware, Fully Dynamic
// Aggregation options are driven by the selected field's dataType.
// Multi-field mode shows two explicit avg options.

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, Eye, EyeOff, X, Check, Settings2, AlertTriangle } from 'lucide-react';
import {
  WidgetConfig, DEFAULT_WIDGET_COLORS, generateWidgetId,
  loadWidgetConfig, saveWidgetConfig,
  getAggregationOptionsForField, getValidAggregations,
  supportsMultiField, getFieldSuggestions, TYPE_INFO,
  AggregationMode,
} from '../lib/widgets';

const API = '/api';
const SCHOOL_ID = typeof localStorage !== 'undefined'
  ? localStorage.getItem('anyschool_current_school') || '88374870-9175-4565-a876-f17c2e295519'
  : '88374870-9175-4565-a876-f17c2e295519';

interface Props {
  pageKey: string;
  onClose: () => void;
}

type Tab = 'kpi' | 'chart';

export default function WidgetEditor({ pageKey, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('kpi');
  const [editing, setEditing] = useState<string | null>(null);
  const [fields, setFields] = useState<any[]>([]);
  const [widgets, setWidgets] = useState<WidgetConfig[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = loadWidgetConfig(pageKey);
    setWidgets(saved);
    const cacheKey = `anyschool_fields_${SCHOOL_ID}`;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const cached = JSON.parse(raw);
        if (Date.now() - cached.at < 60_000) {
          setFields(cached.fields);
          setReady(true);
          return;
        }
      }
    } catch {}
    fetch(`${API}/learners/fields/${SCHOOL_ID}`)
      .then(r => r.json())
      .then(d => {
        const f = d.fields || [];
        setFields(f);
        setReady(true);
        try { localStorage.setItem(cacheKey, JSON.stringify({ fields: f, at: Date.now() })); } catch {}
      })
      .catch(() => setReady(true));
  }, [pageKey]);

  const updateWidgets = (next: WidgetConfig[]) => {
    setWidgets(next);
    saveWidgetConfig(pageKey, next);
  };

  const filtered = widgets.filter(w => w.type === tab);
  const editingWidget = widgets.find(w => w.id === editing);

  // Determine which fields are available for the editing widget's aggregation
  const editingFieldType = editingWidget?.dataField
    ? fields.find(f => f.internalName === editingWidget.dataField)?.dataType
    : null;

  const addWidget = () => {
    const id = generateWidgetId();
    const w: WidgetConfig = {
      id, type: tab,
      chartType: tab === 'kpi' ? 'number' : 'bar',
      title: tab === 'kpi' ? 'New KPI' : 'New Chart',
      dataField: '',
      aggregation: 'count',
      color: DEFAULT_WIDGET_COLORS[widgets.length % DEFAULT_WIDGET_COLORS.length].color,
      bgColor: DEFAULT_WIDGET_COLORS[widgets.length % DEFAULT_WIDGET_COLORS.length].bg,
      size: 'md', hidden: false,
    };
    updateWidgets([...widgets, w]);
    setEditing(id);
  };

  const patch = (id: string, p: Partial<WidgetConfig>) => {
    updateWidgets(widgets.map(w => w.id === id ? { ...w, ...p } : w));
  };

  const remove = (id: string) => {
    updateWidgets(widgets.filter(w => w.id !== id));
    if (editing === id) setEditing(null);
  };

  // When field changes, auto-adjust aggregation if it's no longer valid
  const handleFieldChange = (widgetId: string, newField: string) => {
    const w = widgets.find(wg => wg.id === widgetId);
    if (!w) return;
    const fieldType = fields.find(f => f.internalName === newField)?.dataType ?? 'text';
    const valid = getValidAggregations(fieldType);
    const needsUpdate = !valid.includes(w.aggregation);
    patch(widgetId, {
      dataField: newField,
      aggregation: needsUpdate ? 'count' : w.aggregation,
      // If switching to non-numeric, clear dataFields
      dataFields: supportsMultiField(fieldType) ? w.dataFields : undefined,
    });
  };

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9998,
      background: 'rgba(0,0,0,0.3)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 14,
          width: 520, maxHeight: '85vh',
          overflowY: 'auto', padding: 24,
          boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
          animation: 'slideUp 0.25s ease',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Settings2 size={18} style={{ color: 'var(--brand-primary)' }} />
            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Customize Widgets</h3>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <X size={18} style={{ color: '#9ca3af' }} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {(['kpi', 'chart'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setEditing(null); }}
              style={{
                padding: '6px 14px', borderRadius: 6, fontSize: '0.8rem', fontWeight: 500,
                border: '1px solid', cursor: 'pointer',
                background: tab === t ? 'var(--brand-primary)' : '#f3f4f6',
                color: tab === t ? '#fff' : '#374151',
                borderColor: tab === t ? 'var(--brand-primary)' : '#e5e7eb',
              }}
            >
              {t === 'kpi' ? 'KPIs' : 'Charts'} ({widgets.filter(w => w.type === t).length})
            </button>
          ))}
        </div>

        {!ready && (
          <div style={{ padding: '24px 0', textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem' }}>Loading...</div>
        )}

        {ready && filtered.length === 0 && (
          <div style={{ padding: '24px 0', textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem' }}>
            No {tab === 'kpi' ? 'KPIs' : 'charts'} yet. Click Add below.
          </div>
        )}

        {ready && filtered.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
            {filtered.map(w => {
              // Check if the widget's field still exists
              const fieldExists = !w.dataField || fields.some(f => f.internalName === w.dataField);
              return (
                <div
                  key={w.id}
                  onClick={() => setEditing(editing === w.id ? null : w.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', borderRadius: 8,
                    border: editing === w.id ? '1px solid #bfdbfe' : '1px solid #f3f4f6',
                    background: editing === w.id ? '#eff6ff' : w.hidden ? '#f9fafb' : '#fff',
                    cursor: 'pointer', opacity: w.hidden ? 0.5 : 1,
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: w.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 500 }}>{w.title}</span>
                  {!fieldExists && (
                    <span title="Field missing" style={{ display: 'inline-flex' }}>
                      <AlertTriangle size={12} style={{ color: '#ef4444', flexShrink: 0 }} />
                    </span>
                  )}
                  <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
                    {w.aggregation} {w.dataField ? `· ${w.dataField}` : '(all records)'}
                  </span>
                  <button onClick={e => { e.stopPropagation(); patch(w.id, { hidden: !w.hidden }); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                    {w.hidden ? <EyeOff size={13} style={{ color: '#9ca3af' }} /> : <Eye size={13} style={{ color: '#9ca3af' }} />}
                  </button>
                  <button onClick={e => { e.stopPropagation(); remove(w.id); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                    <Trash2 size={13} style={{ color: '#ef4444' }} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {ready && (
          <button onClick={addWidget} style={{
            width: '100%', padding: '8px 0', borderRadius: 8,
            border: '1px dashed #d1d5db', background: '#f9fafb',
            cursor: 'pointer', fontSize: '0.8rem', color: '#374151',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <Plus size={14} /> Add {tab === 'kpi' ? 'KPI' : 'Chart'}
          </button>
        )}

        {/* Edit panel */}
        {editingWidget && (
          <div style={{
            marginTop: 16, padding: 16, borderRadius: 10,
            background: '#f8fafc', border: '1px solid #e2e8f0',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Editing: {editingWidget.title}</span>
              <button onClick={() => setEditing(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={14} style={{ color: '#9ca3af' }} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Title */}
              <div>
                <label style={labelStyle}>Title</label>
                <input value={editingWidget.title} onChange={e => patch(editingWidget.id, { title: e.target.value })}
                  style={inputStyle} />
              </div>

              {/* Data Field — type-aware */}
              <div>
                <label style={labelStyle}>
                  Data Field
                  {editingWidget.aggregation === 'count' && (
                    <span style={{ fontWeight: 400, color: '#9ca3af', marginLeft: 6 }}>(optional for count)</span>
                  )}
                </label>
                <select
                  value={editingWidget.dataField}
                  onChange={e => handleFieldChange(editingWidget.id, e.target.value)}
                  style={inputStyle}
                >
                  <option value="">— No field (count all records) —</option>
                  {fields.filter(f => f.dataType !== 'file' && f.internalName !== 'photo').map(f => (
                    <option key={f.internalName} value={f.internalName}>
                      {f.name} ({f.dataType === 'relationship' ? `Linked ${f._targetEntityDisplayName || 'Record'}` : TYPE_INFO[f.dataType]?.label || f.dataType})
                    </option>
                  ))}
                </select>
              </div>

              {/* Multi-field checkboxes — only for numeric types */}
              {editingWidget.dataField && supportsMultiField(editingFieldType || 'text') && (
                <div>
                  <label style={labelStyle}>
                    Additional Fields
                    <span style={{ fontWeight: 400, color: '#9ca3af', marginLeft: 6 }}>(combine with primary for sum/avg)</span>
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 80, overflowY: 'auto', padding: 4, background: '#f9fafb', borderRadius: 6 }}>
                    {getFieldSuggestions('multi_field', editingWidget.type, fields)
                      .filter(f => f.internalName !== editingWidget.dataField)
                      .map(f => {
                        const isActive = (editingWidget.dataFields || []).includes(f.internalName);
                        return (
                          <button key={f.internalName} type="button" onClick={() => {
                            const current = editingWidget.dataFields || [editingWidget.dataField];
                            const next = isActive
                              ? current.filter(x => x !== f.internalName)
                              : [...current, f.internalName];
                            patch(editingWidget.id, { dataFields: next.length > 0 ? next : [editingWidget.dataField] });
                          }}
                            style={{
                              padding: '2px 8px', borderRadius: 4, fontSize: '0.7rem', cursor: 'pointer',
                              border: '1px solid', transition: 'all 0.15s',
                              background: isActive ? '#dbeafe' : '#fff',
                              color: isActive ? '#2563eb' : '#6b7280',
                              borderColor: isActive ? '#93c5fd' : '#e5e7eb',
                            }}>
                            {f.name}
                          </button>
                        );
                      })}
                  </div>
                  {(editingWidget.dataFields || []).length > 1 && (
                    <p style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: 4 }}>
                      Combining {(editingWidget.dataFields || []).length} fields
                    </p>
                  )}
                </div>
              )}

              {/* Aggregation — type-driven dropdown */}
              <div>
                <label style={labelStyle}>Aggregation</label>
                <select
                  value={editingWidget.aggregation}
                  onChange={e => patch(editingWidget.id, { aggregation: e.target.value as AggregationMode })}
                  style={inputStyle}
                >
                  {editingWidget.dataField ? (
                    // Field selected: show only valid aggregations for its type
                    getAggregationOptionsForField(editingFieldType || 'text').map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))
                  ) : (
                    // No field: count is the only option
                    <option value="count">Count (all records)</option>
                  )}
                </select>
                {/* Show type info badge */}
                {editingWidget.dataField && editingFieldType && (
                  <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: 4 }}>
                    Field type: {TYPE_INFO[editingFieldType]?.label || editingFieldType}
                    {getValidAggregations(editingFieldType).length > 0 && (
                      <> — {getValidAggregations(editingFieldType).length} aggregations available</>
                    )}
                  </div>
                )}
              </div>

              {/* Multi-field avg mode selector — only when 2+ fields selected and aggregation is avg */}
              {editingWidget.dataFields && editingWidget.dataFields.length > 1 &&
                (editingWidget.aggregation === 'avg' || editingWidget.aggregation === 'avg_across_fields') && (
                <div style={{ padding: 8, background: '#f0f9ff', borderRadius: 6, border: '1px solid #bae6fd' }}>
                  <label style={labelStyle}>Average Mode</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', cursor: 'pointer' }}>
                      <input type="radio" name={`avg-mode-${editingWidget.id}`}
                        checked={editingWidget.aggregation === 'avg'}
                        onChange={() => patch(editingWidget.id, { aggregation: 'avg' })} />
                      <div>
                        <div style={{ fontWeight: 500 }}>Average per record</div>
                        <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>
                          For each record, sum selected fields, then average across records
                        </div>
                      </div>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', cursor: 'pointer' }}>
                      <input type="radio" name={`avg-mode-${editingWidget.id}`}
                        checked={editingWidget.aggregation === 'avg_across_fields'}
                        onChange={() => patch(editingWidget.id, { aggregation: 'avg_across_fields' })} />
                      <div>
                        <div style={{ fontWeight: 500 }}>Average across fields</div>
                        <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>
                          Sum each field independently, then divide by field count
                        </div>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {/* Chart-specific options */}
              {editingWidget.type === 'chart' && (
                <>
                  <div>
                    <label style={labelStyle}>Chart Type</label>
                    <select value={editingWidget.chartType} onChange={e => patch(editingWidget.id, { chartType: e.target.value as any })}
                      style={inputStyle}>
                      <option value="bar">Bar</option><option value="line">Line</option>
                      <option value="pie">Pie</option><option value="donut">Donut</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>
                      Group By
                      <span style={{ fontWeight: 400, color: '#9ca3af', marginLeft: 6 }}>(categorical fields auto-bucket numeric/date)</span>
                    </label>
                    <select value={editingWidget.groupByField || ''} onChange={e => patch(editingWidget.id, { groupByField: e.target.value || undefined })}
                      style={inputStyle}>
                      <option value="">No grouping</option>
                      {getFieldSuggestions('group', 'chart', fields).map(f => (
                        <option key={f.internalName} value={f.internalName}>
                          {f.name} {TYPE_INFO[f.dataType] ? `(${TYPE_INFO[f.dataType].label})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {/* Prefix for KPI */}
              {editingWidget.type === 'kpi' && (
                <div>
                  <label style={labelStyle}>Prefix</label>
                  <input value={editingWidget.prefix || ''} onChange={e => patch(editingWidget.id, { prefix: e.target.value })}
                    placeholder="e.g. KES"
                    style={inputStyle} />
                </div>
              )}

              {/* Colors */}
              <div>
                <label style={labelStyle}>Color</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {DEFAULT_WIDGET_COLORS.map(c => (
                    <button key={c.color} onClick={() => patch(editingWidget.id, { color: c.color, bgColor: c.bg })}
                      style={{
                        width: 28, height: 28, borderRadius: 6, background: c.color, cursor: 'pointer',
                        border: editingWidget.color === c.color ? '2.5px solid #111' : '2.5px solid transparent',
                      }} title={c.name} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #f3f4f6', textAlign: 'right' }}>
          <button onClick={onClose} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none',
            background: 'var(--brand-primary)', color: '#fff',
            fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <Check size={14} /> Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

const labelStyle = { fontSize: '0.75rem', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: 4 } as const;
const inputStyle = { width: '100%', padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: '0.85rem' } as const;
