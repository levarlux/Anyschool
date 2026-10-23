// Learners Pillar — Doc 15
// Configurable widget system, advanced filtering, full table

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users, Plus, Upload, Search, ChevronRight,
  X, SlidersHorizontal, Settings2, Download, FileText, Trash2,
} from 'lucide-react';
import LearnerDetail from './LearnerDetail';
import AddLearnerForm from './AddLearnerForm';
import LearnerImport from './LearnerImport';
import ASSpinner from './ASSpinner';
import Avatar from './Avatar';
import KPICard from './KPICard';
import ChartWidget from './ChartWidget';
import WidgetEditor from './WidgetEditor';
import FieldManager from './FieldManager';
import { LearnersListSkeleton, KPISkeleton, ChartSkeleton } from './Skeleton';
import { useConfirm } from './ConfirmProvider';
import {
  WidgetConfig,
  loadWidgetConfig,
  computeKPI,
  computeChartData,
  syncWidgetConfigFromServer,
} from '../lib/widgets';
import { useEntityFields } from '../lib/useEntityFields';
import DataTable from './DataTable';
import type { DataTableField } from './DataTable';

const API = '/api';
const SCHOOL_ID = localStorage.getItem('anyschool_current_school') || '88374870-9175-4565-a876-f17c2e295519';
const PAGE_KEY = 'learners';

interface RecordData {
  id: string;
  values: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

interface FilterRule {
  fieldInternalName: string;
  operator: 'contains' | 'equals' | 'starts_with' | 'gt' | 'lt' | 'is_empty' | 'is_not_empty';
  value: string;
}

type View = 'list' | 'detail' | 'add' | 'import';

export default function LearnersPage() {
  const { confirm } = useConfirm();
  const [view, setView] = useState<View>('list');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [widgets, setWidgets] = useState<WidgetConfig[]>([]);
  const [showWidgetEditor, setShowWidgetEditor] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // ─── Reusable field/record management (works for any entity type) ───
  const fetchList = useCallback(async () => {
    const res = await fetch(`${API}/learners/list/${SCHOOL_ID}`);
    if (!res.ok) throw new Error('Failed to fetch');
    const data = await res.json();
    // Safety net: never let base64 blobs reach localStorage — a 4.5MB payload blows the
    // ~5MB quota, saveCache silently fails, and the page loses its cache (re-fetches forever).
    if (Array.isArray(data.records)) {
      for (const r of data.records) {
        const vals = r.values;
        if (!vals) continue;
        for (const k of Object.keys(vals)) {
          if (typeof vals[k] === 'string' && vals[k].startsWith('data:')) vals[k] = null;
        }
      }
    }
    return data;
  }, []);
  const {
    fields, records, loading: _loading,
    orderedFields, orderedFieldsOnly, onFieldsChanged, onLocalFieldsChange, onVisibilityChanged,
  } = useEntityFields('learner', fetchList);
  const loading = _loading;
  const setFields = onLocalFieldsChange; // alias for compatibility

  const fieldMap = useMemo(() => {
    const map: Record<string, any> = {};
    for (const f of fields) map[f.internalName] = f;
    return map;
  }, [fields]);

  // Load widget config on first render + sync from server for cross-device consistency
  useEffect(() => {
    setWidgets(loadWidgetConfig(PAGE_KEY));
    syncWidgetConfigFromServer().then(() => {
      setWidgets(loadWidgetConfig(PAGE_KEY));
    }).catch(() => {});
  }, []);

  // ─── Filter Logic ─────────────────────────────────────────
  const applyFilters = useCallback((record: RecordData) => {
    if (search) {
      const s = search.toLowerCase();
      if (!Object.values(record.values || {}).some(v => String(v).toLowerCase().includes(s))) return false;
    }
    for (const filter of filters) {
      const val = record.values?.[filter.fieldInternalName];
      const strVal = String(val ?? '').toLowerCase();
      const filterVal = filter.value.toLowerCase();
      switch (filter.operator) {
        case 'contains': if (!strVal.includes(filterVal)) return false; break;
        case 'equals': if (strVal !== filterVal) return false; break;
        case 'starts_with': if (!strVal.startsWith(filterVal)) return false; break;
        case 'gt': if (Number(val) <= Number(filter.value)) return false; break;
        case 'lt': if (Number(val) >= Number(filter.value)) return false; break;
        case 'is_empty': if (val !== null && val !== '' && val !== undefined) return false; break;
        case 'is_not_empty': if (val === null || val === '' || val === undefined) return false; break;
      }
    }
    return true;
  }, [search, filters]);

  const filteredRecords = useMemo(() => records.filter(applyFilters), [records, applyFilters]);

  const addFilter = () => setFilters([...filters, { fieldInternalName: fields[0]?.internalName || '', operator: 'contains', value: '' }]);
  const updateFilter = (i: number, patch: Partial<FilterRule>) => setFilters(filters.map((f, idx) => idx === i ? { ...f, ...patch } : f));
  const removeFilter = (i: number) => setFilters(filters.filter((_, idx) => idx !== i));

  // ─── Widget Data Computation ───────────────────────────────
  const kpiWidgets = widgets.filter(w => w.type === 'kpi' && !w.hidden);
  const chartWidgets = widgets.filter(w => w.type === 'chart' && !w.hidden);

  const handleRecordCreated = async () => { setView('list'); await onFieldsChanged(); };
  const handleRecordDeleted = async () => { setView('list'); setSelectedId(null); await onFieldsChanged(); };

  // Use orderedFields from the hook (already sorted by saved order, photo always included)
  const displayFields = useMemo(
    () => orderedFields.filter((f: any) => f.dataType !== 'relationship'),
    [orderedFields]
  );

  // ─── Bulk Selection ──────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredRecords.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRecords.map(r => r.id)));
    }
  };
  const handleBulkDelete = async () => {
    const count = selectedIds.size;
    const typed = await confirm({
      title: `Delete ${count} Student${count > 1 ? 's' : ''}`,
      message: `This will PERMANENTLY delete ${count} student${count > 1 ? 's' : ''} and all related records (enrollments, assessments, etc). This cannot be undone.`,
      confirmText: 'Permanently Delete',
      variant: 'destructive',
      requireTypedConfirm: true,
      typedConfirmText: 'DELETE',
    });
    if (!typed) return;
    setBulkDeleting(true);
    try {
      const res = await fetch(`${API}/learners/bulk-delete/${SCHOOL_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordIds: Array.from(selectedIds) }),
      });
      if (res.ok) {
        setSelectedIds(new Set());
        await onFieldsChanged();
      }
    } catch {}
    setBulkDeleting(false);
  };

  // ─── Export Functions ───────────────────────────────────────
  const handleExportCSV = () => {
    const exportFields = fields.filter(f => f.dataType !== 'file' && f.internalName !== 'photo');
    const headers = ['ID', ...exportFields.map(f => f.name)];
    const rows = filteredRecords.map(r => {
      return [
        r.id.slice(0, 8),
        ...exportFields.map(f => {
          const v = r.values?.[f.internalName];
          if (v === null || v === undefined) return '';
          if (typeof v === 'string' && v.startsWith('data:')) return '[Photo]';
          return String(v);
        }),
      ];
    });
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `learners_export_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportXLSX = () => {
    const exportFields = fields.filter(f => f.dataType !== 'file' && f.internalName !== 'photo');
    const headers = ['ID', ...exportFields.map(f => f.name)];
    const rows = filteredRecords.map(r => {
      return [
        r.id.slice(0, 8),
        ...exportFields.map(f => {
          const v = r.values?.[f.internalName];
          if (v === null || v === undefined) return '';
          if (typeof v === 'string' && v.startsWith('data:')) return '[Photo]';
          return String(v);
        }),
      ];
    });
    // Tab-separated values — Excel opens this natively as .xls
    const tsv = [headers.join('\t'), ...rows.map(r => r.join('\t'))].join('\n');
    const blob = new Blob([tsv], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `learners_export_${new Date().toISOString().slice(0, 10)}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const [showExportMenu, setShowExportMenu] = useState(false);

  // ─── Views ────────────────────────────────────────────────
  if (view === 'add') return <AddLearnerForm onCreated={handleRecordCreated} onCancel={() => setView('list')} />;
  if (view === 'import') return <LearnerImport fields={fields} onImported={async () => { setView('list'); await onFieldsChanged(); }} onCancel={() => setView('list')} />;
  if (view === 'detail' && selectedId) {
    const clickedRecord = records.find(r => r.id === selectedId);
    return <LearnerDetail recordId={selectedId} initialData={clickedRecord || null} onBack={() => { setView('list'); setSelectedId(null); }} onDeleted={handleRecordDeleted} onSaved={onFieldsChanged} />;
  }

  return (
    <div className="page-enter learners-page">
      {/* Header */}
      <div className="entity-header">
        <div className="entity-header-left">
          <div className="entity-icon-wrap" style={{ background: '#eff6ff' }}>
            <Users size={22} style={{ color: '#3b82f6' }} />
          </div>
          <div>
            <h2>Learners</h2>
            <p className="text-muted">{records.length} total records</p>
          </div>
        </div>
        <div className="entity-header-actions">
          <div className="search-input-wrap">
            <Search size={15} className="search-icon" />
            <input type="text" className="search-input" placeholder="Search learners..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button className={`btn ${showFilters ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setShowFilters(!showFilters)}>
            <SlidersHorizontal size={15} /> Filters
            {filters.length > 0 && <span className="badge" style={{ marginLeft: 4, background: '#fff', color: 'var(--brand-primary)' }}>{filters.length}</span>}
          </button>
          <button className="btn btn-secondary" onClick={() => setShowWidgetEditor(true)}>
            <Settings2 size={15} /> Customize
          </button>
          <div style={{ position: 'relative' }}>
            <button className="btn btn-secondary" onClick={e => { e.stopPropagation(); setShowExportMenu(!showExportMenu); }}>
              <Download size={15} /> Export
            </button>
            {showExportMenu && (
              <div onClick={e => e.stopPropagation()} style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 4,
                background: 'white', borderRadius: 8, border: '1px solid #e5e7eb',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 50, minWidth: 160,
              }}>
                <button onClick={() => { handleExportCSV(); setShowExportMenu(false); }}
                  style={{ width: '100%', padding: '8px 14px', textAlign: 'left', fontSize: '0.8rem', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  <FileText size={14} style={{ color: '#6b7280' }} /> Export as CSV
                </button>
                <button onClick={() => { handleExportXLSX(); setShowExportMenu(false); }}
                  style={{ width: '100%', padding: '8px 14px', textAlign: 'left', fontSize: '0.8rem', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  <FileText size={14} style={{ color: '#6b7280' }} /> Export as Excel
                </button>
              </div>
            )}
          </div>
          <button className="btn btn-secondary" onClick={() => setView('import')}><Upload size={15} /> Import</button>
          <button className="btn btn-primary" onClick={() => setView('add')}><Plus size={15} /> Add Learner</button>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="card filter-panel" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 600 }}>Advanced Filters</h4>
            <button className="btn btn-ghost" onClick={addFilter} style={{ fontSize: '0.8rem' }}><Plus size={12} /> Add Filter</button>
          </div>
          {filters.length === 0 ? (
            <p style={{ fontSize: '0.8rem', color: 'var(--brand-text-tertiary)' }}>No filters applied. Click "Add Filter" to narrow results.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filters.map((filter, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select className="select" style={{ flex: 2 }} value={filter.fieldInternalName} onChange={e => updateFilter(i, { fieldInternalName: e.target.value })}>
                    {fields.filter(f => f.dataType !== 'file' && f.dataType !== 'relationship' && f.internalName !== 'photo').map(f => <option key={f.id} value={f.internalName}>{f.name}</option>)}
                  </select>
                  <select className="select" style={{ flex: 1 }} value={filter.operator} onChange={e => updateFilter(i, { operator: e.target.value as any })}>
                    <option value="contains">Contains</option><option value="equals">Equals</option><option value="starts_with">Starts with</option>
                    <option value="gt">Greater than</option><option value="lt">Less than</option><option value="is_empty">Is empty</option><option value="is_not_empty">Is not empty</option>
                  </select>
                  {!['is_empty', 'is_not_empty'].includes(filter.operator) && (
                    <input className="input" style={{ flex: 2 }} placeholder="Value..." value={filter.value} onChange={e => updateFilter(i, { value: e.target.value })} />
                  )}
                  <button className="btn btn-ghost btn-icon" onClick={() => removeFilter(i)} style={{ width: 28, height: 28 }}><X size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Field Manager */}
      <FieldManager
        fields={orderedFieldsOnly.filter((f: any) => f.dataType !== 'relationship')}
        entityType="learner"
        onFieldsChanged={onFieldsChanged}
        onLocalFieldsChange={setFields}
        onVisibilityChanged={onVisibilityChanged}
      />

      {/* Widget Grid — KPIs */}
      {loading ? (
        <KPISkeleton count={3} />
      ) : kpiWidgets.length > 0 && (
        <div className="kpi-grid" style={{ gridTemplateColumns: `repeat(${Math.min(kpiWidgets.length, 3)}, 1fr)`, marginBottom: 16 }}>
          {kpiWidgets.map((w) => {
            const kpi = computeKPI(records, w.dataField, w.aggregation, w.prefix, w.dataFields, fieldMap);
            return <KPICard key={w.id} config={w} value={kpi.displayValue} error={kpi.error} fieldMissing={kpi.fieldMissing} />;
          })}
        </div>
      )}

      {/* Widget Grid — Charts */}
      {loading ? (
        <ChartSkeleton count={Math.min(chartWidgets.length || 2, 3)} />
      ) : chartWidgets.length > 0 && (
        <div className="chart-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(chartWidgets.length, 3)}, 1fr)`, gap: 16, marginBottom: 16 }}>
          {chartWidgets.map((w) => {
            const result = computeChartData(records, w.dataField, w.groupByField, w.aggregation, w.dataFields, fieldMap);
            return <ChartWidget key={w.id} config={w} data={result.data} error={result.error} fieldMissing={result.fieldMissing} />;
          })}
        </div>
      )}

      {/* Results count */}
      {(search || filters.length > 0) && (
        <div style={{ marginBottom: 12, fontSize: '0.8rem', color: 'var(--brand-text-secondary)' }}>
          Showing {filteredRecords.length} of {records.length} records
          {(filters.length > 0 || search) && (
            <button className="btn btn-ghost" onClick={() => { setFilters([]); setSearch(''); }} style={{ marginLeft: 8, fontSize: '0.75rem' }}>Clear all</button>
          )}
        </div>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
          background: '#eff6ff', borderRadius: 10, marginBottom: 12,
          border: '1px solid #bfdbfe',
        }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#2563eb' }}>
            {selectedIds.size} selected
          </span>
          <button className="btn btn-ghost" onClick={() => setSelectedIds(new Set())} style={{ fontSize: '0.8rem' }}>
            Clear
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn" onClick={handleBulkDelete} disabled={bulkDeleting}
            style={{ background: '#dc2626', color: 'white', fontSize: '0.8rem', padding: '6px 12px' }}>
            {bulkDeleting ? <ASSpinner size="sm" /> : <Trash2 size={13} />}
            Delete {selectedIds.size} permanently
          </button>
        </div>
      )}

      {/* Table */}
      <div className="entity-content card">
        <DataTable
          fields={displayFields as DataTableField[]}
          records={filteredRecords}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          onRowClick={(id) => { setSelectedId(id); setView('detail'); }}
          loading={loading}
          loadingSkeleton={<LearnersListSkeleton />}
          emptyIcon={<Users size={28} style={{ color: '#3b82f6' }} />}
          emptyTitle={records.length === 0 ? 'No learners yet' : 'No matching records'}
          emptyDescription={records.length === 0 ? 'Add your first learner or import from a CSV file.' : 'Try adjusting your search or filters.'}
          emptyActions={records.length === 0 ? (
            <div className="empty-state-actions">
              <button className="btn btn-primary" onClick={() => setView('add')}><Plus size={15} /> Add Learner</button>
              <button className="btn btn-secondary" onClick={() => setView('import')}><Upload size={15} /> Import File</button>
            </div>
          ) : undefined}
          extraColumns={[{
            header: '',
            render: (record) => {
              const vals = record.values || {};
              const name = vals['full_name'] || vals['name'] || [vals['first_name'], vals['last_name']].filter(Boolean).join(' ') || 'Learner';
              const photo = vals['photo'] || vals['passport_photo'] || vals['avatar'] || null;
              return <Avatar photo={photo} name={name} size={32} />;
            },
            width: 44,
          }]}
          actions={<ChevronRight size={14} style={{ color: '#9ca3af' }} />}
        />
      </div>

      {/* Widget Editor Modal — self-contained */}
      {showWidgetEditor && (
        <WidgetEditor
          pageKey={PAGE_KEY}
          onClose={() => { setShowWidgetEditor(false); setWidgets(loadWidgetConfig(PAGE_KEY)); }}
        />
      )}
    </div>
  );
}
