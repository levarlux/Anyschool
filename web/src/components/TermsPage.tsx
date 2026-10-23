// Terms Pillar — Doc 19
// Tree view with hierarchy, status badges, date range, KPI widgets

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Calendar, Plus, Search, ChevronRight,
  X, SlidersHorizontal, Settings2, Download, FileText, Trash2,
} from 'lucide-react';
import TermDetail from './TermDetail';
import AddTermForm from './AddTermForm';
import ASSpinner from './ASSpinner';
import KPICard from './KPICard';
import ChartWidget from './ChartWidget';
import WidgetEditor from './WidgetEditor';
import FieldManager from './FieldManager';
import { KPISkeleton, ChartSkeleton } from './Skeleton';
import { useConfirm } from './ConfirmProvider';
import { useEntityFields } from '../lib/useEntityFields';
import {
  WidgetConfig, loadWidgetConfig, computeKPI, computeChartData,
  syncWidgetConfigFromServer,
} from '../lib/widgets';

const API = '/api';
const SCHOOL_ID = localStorage.getItem('anyschool_current_school') || '88374870-9175-4565-a876-f17c2e295519';
const PAGE_KEY = 'terms';

interface FilterRule {
  fieldInternalName: string;
  operator: 'contains' | 'equals' | 'starts_with' | 'gt' | 'lt' | 'is_empty' | 'is_not_empty';
  value: string;
}

interface TreeNode {
  record: any;
  children: TreeNode[];
  depth: number;
}

type View = 'list' | 'detail' | 'add';

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  Active: { bg: '#dcfce7', color: '#16a34a' },
  Completed: { bg: '#f3f4f6', color: '#6b7280' },
  Upcoming: { bg: '#dbeafe', color: '#2563eb' },
};

export default function TermsPage() {
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
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

  const fetchList = useCallback(async () => {
    const res = await fetch(`${API}/terms/list/${SCHOOL_ID}`);
    if (!res.ok) throw new Error('Failed to fetch');
    return res.json();
  }, []);

  const { records, fields, loading, orderedFields, orderedFieldsOnly, onFieldsChanged, onLocalFieldsChange, onVisibilityChanged } = useEntityFields('term', fetchList);

  useEffect(() => {
    setWidgets(loadWidgetConfig(PAGE_KEY));
    syncWidgetConfigFromServer().then(() => {
      setWidgets(loadWidgetConfig(PAGE_KEY));
    }).catch(() => {});
  }, []);

  // ─── Build Tree Structure ─────────────────────────────────────
  const tree = useMemo(() => {
    const filtered = records.filter(record => {
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
    });

    const map = new Map<string, TreeNode>();
    const roots: TreeNode[] = [];

    for (const r of filtered) {
      map.set(r.id, { record: r, children: [], depth: 0 });
    }

    for (const r of filtered) {
      const node = map.get(r.id)!;
      if (r.parentRecordId && map.has(r.parentRecordId)) {
        const parent = map.get(r.parentRecordId)!;
        node.depth = parent.depth + 1;
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }

    const sortNodes = (nodes: TreeNode[]) => {
      nodes.sort((a, b) => {
        const nameA = a.record.values?.term_name || a.record.values?.name || '';
        const nameB = b.record.values?.term_name || b.record.values?.name || '';
        return nameA.localeCompare(nameB);
      });
      for (const n of nodes) sortNodes(n.children);
    };
    sortNodes(roots);

    return roots;
  }, [records, search, filters]);

  // ─── Filter Logic ─────────────────────────────────────────
  const addFilter = () => setFilters([...filters, { fieldInternalName: fields[0]?.internalName || '', operator: 'contains', value: '' }]);
  const updateFilter = (i: number, patch: Partial<FilterRule>) => setFilters(filters.map((f, idx) => idx === i ? { ...f, ...patch } : f));
  const removeFilter = (i: number) => setFilters(filters.filter((_, idx) => idx !== i));

  // ─── Widget Data ───────────────────────────────────────────
  const kpiWidgets = widgets.filter(w => w.type === 'kpi' && !w.hidden);
  const chartWidgets = widgets.filter(w => w.type === 'chart' && !w.hidden);

  const handleRecordCreated = () => { setView('list'); onFieldsChanged(); };
  const handleRecordDeleted = () => { setView('list'); setSelectedId(null); onFieldsChanged(); };

  // ─── Tree Toggle ──────────────────────────────────────────
  const toggleExpand = (parentId: string) => {
    setExpandedParents(prev => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId); else next.add(parentId);
      return next;
    });
  };

  // ─── Bulk Selection ──────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const handleBulkDelete = async () => {
    const count = selectedIds.size;
    const typed = await confirm({
      title: `Delete ${count} Term${count > 1 ? 's' : ''}`,
      message: `This will PERMANENTLY delete ${count} term${count > 1 ? 's' : ''} and all related records. This cannot be undone.`,
      confirmText: 'Permanently Delete',
      variant: 'destructive',
      requireTypedConfirm: true,
      typedConfirmText: 'DELETE',
    });
    if (!typed) return;
    setBulkDeleting(true);
    try {
      const res = await fetch(`${API}/terms/bulk-delete/${SCHOOL_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (res.ok) { setSelectedIds(new Set()); onFieldsChanged(); }
    } catch {}
    setBulkDeleting(false);
  };

  // ─── Export ───────────────────────────────────────────────
  const handleExportCSV = () => {
    const exportFields = orderedFields.filter(f => f.dataType !== 'file' && f.internalName !== 'photo');
    const headers = ['ID', ...exportFields.map(f => f.name), 'Children', 'Status'];
    const rows = records.map(r => [
      r.id.slice(0, 8),
      ...exportFields.map(f => String(r.values?.[f.internalName] ?? '')),
      r.values?.__child_count ?? 0,
      r.values?.status ?? '',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `terms_export_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const [showExportMenu, setShowExportMenu] = useState(false);

  // ─── Views ────────────────────────────────────────────────
  // ─── Display Fields (must be before any early returns for Rules of Hooks) ──
  const displayFields = useMemo(
    () => orderedFields.filter(f => f.dataType !== 'file' && f.internalName !== 'photo'),
    [orderedFields]
  );

  if (view === 'add') return <AddTermForm onCreated={handleRecordCreated} onCancel={() => setView('list')} />;
  if (view === 'detail' && selectedId) {
    return <TermDetail recordId={selectedId} initialData={null} onBack={() => { setView('list'); setSelectedId(null); }} onDeleted={handleRecordDeleted} onSaved={onFieldsChanged} />;
  }

  // ─── Tree Row Renderer ──────────────────────────────────────

  const renderTreeRow = (node: TreeNode): React.ReactNode => {
    const { record, children, depth } = node;
    const hasChildren = children.length > 0;
    const isExpanded = expandedParents.has(record.id);
    const childCount = record.values?.__child_count ?? 0;

    // First display field = name, rest = metadata
    const nameField = displayFields[0];
    const metaFields = displayFields.slice(1);
    const termName = nameField ? (record.values?.[nameField.internalName] || 'Unnamed Term') : 'Unnamed Term';

    return (
      <div key={record.id}>
        <div
          onClick={() => { setSelectedId(record.id); setView('detail'); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 12px', paddingLeft: 12 + depth * 24,
            background: selectedIds.has(record.id) ? 'var(--brand-primary-light, #eff6ff)' : 'white',
            borderBottom: '1px solid #f3f4f6', cursor: 'pointer',
            transition: 'background 0.1s',
          }}
          onMouseEnter={e => { if (!selectedIds.has(record.id)) e.currentTarget.style.background = '#f9fafb'; }}
          onMouseLeave={e => { if (!selectedIds.has(record.id)) e.currentTarget.style.background = 'white'; }}
        >
          {/* Checkbox */}
          <input type="checkbox" checked={selectedIds.has(record.id)}
            onChange={() => toggleSelect(record.id)}
            onClick={e => e.stopPropagation()}
            style={{ cursor: 'pointer', flexShrink: 0, margin: 0 }}
          />

          {/* Expand/Collapse */}
          <div style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {hasChildren ? (
              <button onClick={(e) => { e.stopPropagation(); toggleExpand(record.id); }}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex' }}>
                <ChevronRight size={14} style={{
                  color: '#9ca3af', transition: 'transform 0.15s',
                  transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                }} />
              </button>
            ) : (
              <span style={{ width: 14 }} />
            )}
          </div>

          {/* Icon */}
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: hasChildren ? '#dbeafe' : '#faf5ff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Calendar size={15} style={{ color: hasChildren ? '#2563eb' : '#7c3aed' }} />
          </div>

          {/* Name + metadata fields */}
          <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {depth > 0 && <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>└</span>}
              <span style={{ fontWeight: hasChildren ? 600 : 500, color: '#374151', fontSize: '0.85rem' }}>
                {termName}
              </span>
              {metaFields.map(f => {
                const val = record.values?.[f.internalName];
                if (!val && val !== 0) return null;
                if (f.internalName === 'status') {
                  const style = STATUS_COLORS[val] || { bg: '#f3f4f6', color: '#6b7280' };
                  return <span key={f.id} className="badge" style={{ background: style.bg, color: style.color, fontWeight: 600, fontSize: '0.7rem' }}>{val}</span>;
                }
                if (f.dataType === 'boolean') {
                  return <span key={f.id} className="badge" style={{ background: val ? '#dcfce7' : '#f3f4f6', color: val ? '#16a34a' : '#6b7280', fontSize: '0.7rem' }}>{val ? 'Yes' : 'No'}</span>;
                }
                if (f.dataType === 'select' || f.dataType === 'multi-select') {
                  return <span key={f.id} className="badge" style={{ background: '#f0f9ff', color: '#0369a1', fontSize: '0.7rem' }}>{val}</span>;
                }
                return <span key={f.id} style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{f.name}: {String(val)}</span>;
              })}
            </div>
          </div>

          {/* Children count */}
          {hasChildren && (
            <span className="badge" style={{ background: '#dbeafe', color: '#2563eb', fontWeight: 600, fontSize: '0.75rem', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {childCount}
            </span>
          )}

          <ChevronRight size={14} style={{ color: '#d1d5db', flexShrink: 0 }} />
        </div>

        {hasChildren && isExpanded && children.map(child => renderTreeRow(child))}
      </div>
    );
  };

  return (
    <div className="page-enter learners-page">
      {/* Header */}
      <div className="entity-header">
        <div className="entity-header-left">
          <div className="entity-icon-wrap" style={{ background: '#faf5ff' }}>
            <Calendar size={22} style={{ color: '#7c3aed' }} />
          </div>
          <div>
            <h2>Terms</h2>
            <p className="text-muted">{records.length} terms</p>
          </div>
        </div>
        <div className="entity-header-actions">
          <div className="search-input-wrap">
            <Search size={15} className="search-icon" />
            <input type="text" className="search-input" placeholder="Search terms..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button className={`btn ${showFilters ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setShowFilters(!showFilters)}>
            <SlidersHorizontal size={15} /> Filters
            {filters.length > 0 && <span className="badge" style={{ marginLeft: 4, background: '#fff', color: '#7c3aed' }}>{filters.length}</span>}
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
              </div>
            )}
          </div>
          {selectedIds.size > 0 && (
            <button className="btn btn-danger" onClick={handleBulkDelete} disabled={bulkDeleting}>
              {bulkDeleting ? <ASSpinner size="sm" /> : <Trash2 size={13} />}
              Delete {selectedIds.size}
            </button>
          )}
          <button className="btn btn-primary" onClick={() => setView('add')}><Plus size={15} /> Add Term</button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div style={{ background: '#f9fafb', borderRadius: 8, padding: 12, marginBottom: 16, border: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Filters</span>
            <button className="btn btn-ghost" style={{ fontSize: '0.75rem' }} onClick={addFilter}>+ Add Filter</button>
          </div>
          {filters.length === 0 && <p style={{ fontSize: '0.8rem', color: '#9ca3af' }}>No filters applied.</p>}
          {filters.map((filter, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
              <select value={filter.fieldInternalName} onChange={e => updateFilter(i, { fieldInternalName: e.target.value })}
                style={{ fontSize: '0.8rem', padding: '4px 8px', borderRadius: 4, border: '1px solid #d1d5db' }}>
                {orderedFields.filter(f => f.dataType !== 'file').map(f => (
                  <option key={f.id} value={f.internalName}>{f.name}</option>
                ))}
              </select>
              <select value={filter.operator} onChange={e => updateFilter(i, { operator: e.target.value as any })}
                style={{ fontSize: '0.8rem', padding: '4px 8px', borderRadius: 4, border: '1px solid #d1d5db' }}>
                <option value="contains">contains</option>
                <option value="equals">equals</option>
                <option value="starts_with">starts with</option>
                <option value="gt">greater than</option>
                <option value="lt">less than</option>
                <option value="is_empty">is empty</option>
                <option value="is_not_empty">is not empty</option>
              </select>
              <input type="text" value={filter.value} onChange={e => updateFilter(i, { value: e.target.value })}
                placeholder="Value" style={{ fontSize: '0.8rem', padding: '4px 8px', borderRadius: 4, border: '1px solid #d1d5db', flex: 1 }} />
              <button className="btn btn-ghost btn-icon" onClick={() => removeFilter(i)} style={{ width: 28, height: 28 }}><X size={14} /></button>
            </div>
          ))}
        </div>
      )}

      {/* KPI Widgets */}
      {kpiWidgets.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
          {kpiWidgets.map((w, i) => {
            const fieldMap: Record<string, any> = {};
            for (const f of orderedFields) fieldMap[f.internalName] = f;
            const kpi = computeKPI(records, w.dataField, w.aggregation, w.prefix, w.dataFields, fieldMap);
            return <KPICard key={i} config={w} value={kpi.displayValue} error={kpi.error} fieldMissing={kpi.fieldMissing} />;
          })}
        </div>
      )}

      {/* Chart Widgets */}
      {chartWidgets.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 16 }}>
          {chartWidgets.map((w, i) => {
            const fieldMap: Record<string, any> = {};
            for (const f of orderedFields) fieldMap[f.internalName] = f;
            const chart = computeChartData(records, w.dataField, w.groupByField, w.aggregation, w.dataFields, fieldMap);
            return <ChartWidget key={i} config={w} data={chart.data} error={chart.error} fieldMissing={chart.fieldMissing} />;
          })}
        </div>
      )}

      {/* Content */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <KPISkeleton />
            <ChartSkeleton />
          </div>
        ) : tree.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <Calendar size={40} style={{ color: '#d1d5db', marginBottom: 12 }} />
            <p style={{ color: '#9ca3af', marginBottom: 16 }}>
              {records.length === 0 ? 'No terms yet.' : 'No terms match your search.'}
            </p>
            {records.length === 0 && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button className="btn btn-primary" onClick={() => setView('add')}><Plus size={15} /> Add Term</button>
              </div>
            )}
          </div>
        ) : (
          <div>
            {tree.map(node => renderTreeRow(node))}
          </div>
        )}
      </div>

      {/* Widget Editor */}
      {showWidgetEditor && (
        <WidgetEditor
          pageKey={PAGE_KEY}
          onClose={() => { setShowWidgetEditor(false); setWidgets(loadWidgetConfig(PAGE_KEY)); }}
        />
      )}

      <FieldManager
        entityType="term"
        fields={orderedFieldsOnly}
        onFieldsChanged={onFieldsChanged}
        onLocalFieldsChange={onLocalFieldsChange}
        onVisibilityChanged={onVisibilityChanged}
      />
    </div>
  );
}
