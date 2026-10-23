// Classes Pillar — Doc 16
// Tree view with parent/child classes, configurable widgets, advanced filtering

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  School, Plus, Upload, Search, ChevronRight, ChevronDown,
  X, SlidersHorizontal, Settings2, Download, FileText, Trash2,
  Users,
} from 'lucide-react';
import ClassDetail from './ClassDetail';
import AddClassForm from './AddClassForm';
import ClassImport from './ClassImport';
import ASSpinner from './ASSpinner';
import Avatar from './Avatar';
import KPICard from './KPICard';
import ChartWidget from './ChartWidget';
import WidgetEditor from './WidgetEditor';
import FieldManager from './FieldManager';
import { renderCell } from './DataTable';
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
import { isFieldVisible } from '../lib/fieldOrder';

const API = '/api';
const SCHOOL_ID = localStorage.getItem('anyschool_current_school') || '88374870-9175-4565-a876-f17c2e295519';
const PAGE_KEY = 'classes';

interface RecordData {
  id: string;
  values: Record<string, any>;
  parentRecordId?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TreeNode {
  record: RecordData;
  children: TreeNode[];
  depth: number;
}

interface FilterRule {
  fieldInternalName: string;
  operator: 'contains' | 'equals' | 'starts_with' | 'gt' | 'lt' | 'is_empty' | 'is_not_empty';
  value: string;
}

type View = 'list' | 'detail' | 'add' | 'import';

export default function ClassesPage() {
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
    const res = await fetch(`${API}/classes/list/${SCHOOL_ID}`);
    if (!res.ok) throw new Error('Failed to fetch');
    return res.json();
  }, []);

  const { records, fields, loading, orderedFields, orderedFieldsOnly, onFieldsChanged, onLocalFieldsChange, onVisibilityChanged } = useEntityFields('class', fetchList);

  const fieldMap = useMemo(() => {
    const map: Record<string, any> = {};
    for (const f of fields) map[f.internalName] = f;
    return map;
  }, [fields]);

  const visibleFields = useMemo(() =>
    orderedFields.filter(f =>
      f.dataType !== 'relationship' &&
      !f.internalName.startsWith('__') &&
      isFieldVisible('class', SCHOOL_ID, f.id)
    ),
  [orderedFields, SCHOOL_ID]);

  // Dynamic grid: field values column scales with field count
  const GRID_COLS = `20px 28px 36px minmax(${Math.max(200, visibleFields.length * 120)}px, auto) 120px 80px 24px`;

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

    // Create nodes
    for (const r of filtered) {
      map.set(r.id, { record: r as any, children: [], depth: 0 });
    }

    // Build tree
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

    // Sort: parents first, then by name
    const sortNodes = (nodes: TreeNode[]) => {
      nodes.sort((a, b) => {
        const nameA = a.record.values?.class_name || a.record.values?.name || '';
        const nameB = b.record.values?.class_name || b.record.values?.name || '';
        return nameA.localeCompare(nameB);
      });
      for (const n of nodes) sortNodes(n.children);
    };
    sortNodes(roots);

    return roots;
  }, [records, search, filters]);

  const totalRoster = useMemo(() =>
    records.reduce((sum, r) => sum + (r.values?.__roster_count ?? 0), 0),
    [records]
  );

  // ─── Filter Logic ─────────────────────────────────────────
  const addFilter = () => setFilters([...filters, { fieldInternalName: fields[0]?.internalName || '', operator: 'contains', value: '' }]);
  const updateFilter = (i: number, patch: Partial<FilterRule>) => setFilters(filters.map((f, idx) => idx === i ? { ...f, ...patch } : f));
  const removeFilter = (i: number) => setFilters(filters.filter((_, idx) => idx !== i));

  // ─── Widget Data Computation ───────────────────────────────
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
      title: `Delete ${count} Class${count > 1 ? 'es' : ''}`,
      message: `This will PERMANENTLY delete ${count} class${count > 1 ? 'es' : ''} and all related records (enrollments, relationships, etc). This cannot be undone.`,
      confirmText: 'Permanently Delete',
      variant: 'destructive',
      requireTypedConfirm: true,
      typedConfirmText: 'DELETE',
    });
    if (!typed) return;
    setBulkDeleting(true);
    try {
      const res = await fetch(`${API}/classes/bulk-delete/${SCHOOL_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordIds: Array.from(selectedIds) }),
      });
      if (res.ok) {
        setSelectedIds(new Set());
        onFieldsChanged();
      }
    } catch {}
    setBulkDeleting(false);
  };

  // ─── Export Functions ───────────────────────────────────────
  const handleExportCSV = () => {
    const exportFields = fields.filter(f => f.dataType !== 'file' && f.internalName !== 'photo');
    const headers = ['ID', ...exportFields.map(f => f.name), 'Roster Size', 'Children'];
    const rows = records.map(r => [
      r.id.slice(0, 8),
      ...exportFields.map(f => String(r.values?.[f.internalName] ?? '')),
      r.values?.__roster_count ?? 0,
      r.values?.__child_count ?? 0,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `classes_export_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const handleExportXLSX = () => {
    const exportFields = fields.filter(f => f.dataType !== 'file' && f.internalName !== 'photo');
    const headers = ['ID', ...exportFields.map(f => f.name), 'Roster Size', 'Children'];
    const rows = records.map(r => [
      r.id.slice(0, 8),
      ...exportFields.map(f => String(r.values?.[f.internalName] ?? '')),
      r.values?.__roster_count ?? 0,
      r.values?.__child_count ?? 0,
    ]);
    const tsv = [headers.join('\t'), ...rows.map(r => r.join('\t'))].join('\n');
    const blob = new Blob([tsv], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `classes_export_${new Date().toISOString().slice(0, 10)}.xls`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const [showExportMenu, setShowExportMenu] = useState(false);

  // ─── Views ────────────────────────────────────────────────
  if (view === 'add') return <AddClassForm onCreated={handleRecordCreated} onCancel={() => setView('list')} />;
  if (view === 'import') return <ClassImport fields={fields} onImported={() => { setView('list'); onFieldsChanged(); }} onCancel={() => setView('list')} />;
  if (view === 'detail' && selectedId) {
    const clickedRecord = records.find(r => r.id === selectedId);
    return <ClassDetail recordId={selectedId} initialData={clickedRecord || null} onBack={() => { setView('list'); setSelectedId(null); }} onDeleted={handleRecordDeleted} onSaved={onFieldsChanged} />;
  }

  // ─── Tree Row Renderer ─────────────────────────────────────
  const renderTreeRow = (node: TreeNode) => {
    const { record, children, depth } = node;
    const hasChildren = children.length > 0;
    const isExpanded = expandedParents.has(record.id);
    const rosterCount = record.values?.__roster_count ?? 0;
    const childCount = record.values?.__child_count ?? 0;
    const totalRosterInGroup = rosterCount + children.reduce((s, c) => s + (c.record.values?.__roster_count ?? 0), 0);

    // Get avatar-capable file fields (image type) that are visible
    const avatarField = orderedFields.find(f => f.dataType === 'file' && isFieldVisible('class', SCHOOL_ID, f.id) && (f.fileSubtype === 'image' || f.fileSubtype === null || f.fileSubtype === undefined));
    const avatarValue = avatarField ? record.values?.[avatarField.internalName] : null;
    const avatarName = record.values?.class_name || record.values?.name || 'Class';

    return (
      <div key={record.id}>
        <div
          onClick={() => { setSelectedId(record.id); setView('detail'); }}
          style={{
            display: 'grid', gridTemplateColumns: GRID_COLS, alignItems: 'center',
            padding: '10px 12px',
            paddingLeft: 12 + depth * 24,
            borderRadius: 8, cursor: 'pointer',
            borderBottom: '1px solid #f3f4f6',
            transition: 'background 0.1s',
            minHeight: 52,
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
          onMouseLeave={e => e.currentTarget.style.background = ''}
        >
          {/* Expand/collapse chevron */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, overflow: 'hidden' }}>
            {hasChildren ? (
              <button
                onClick={(e) => { e.stopPropagation(); toggleExpand(record.id); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', color: '#6b7280' }}
              >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : depth === 0 ? (
              <span style={{ width: 14 }} />
            ) : (
              <span style={{ width: 8, height: 1, background: '#d1d5db', display: 'block' }} />
            )}
          </div>

          {/* Checkbox */}
          <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden' }}>
            <input
              type="checkbox"
              checked={selectedIds.has(record.id)}
              onChange={() => toggleSelect(record.id)}
              onClick={e => e.stopPropagation()}
              style={{ cursor: 'pointer', flexShrink: 0, margin: 0 }}
            />
          </div>

          {/* Icon / Avatar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, overflow: 'hidden' }}>
            {avatarField ? (
              <Avatar photo={avatarValue} name={avatarName} size={32} borderRadius="50%" />
            ) : (
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: hasChildren ? '#dbeafe' : 'var(--brand-primary-light, #eff6ff)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <School size={15} style={{ color: hasChildren ? '#2563eb' : 'var(--brand-primary, #3b82f6)' }} />
              </div>
            )}
          </div>

          {/* Name + metadata - rendered from orderedFields */}
          <div style={{ minWidth: 0, overflow: 'hidden', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 16px' }}>
            {depth > 0 && <span style={{ color: '#9ca3af', marginRight: 2, fontSize: '0.85rem' }}>└</span>}
            {visibleFields.length > 0 ? (
              visibleFields.slice(0, 5).map((field, i) => {
                const value = record.values?.[field.internalName];
                const cellContent = renderCell(field, value, record);
                return (
                  <span key={field.id} style={{ fontWeight: i === 0 ? (hasChildren ? 600 : 500) : 400, color: '#374151', fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                    {cellContent}
                  </span>
                );
              })
            ) : (
              <span style={{ color: '#9ca3af' }}>Unnamed</span>
            )}
            {visibleFields.length > 5 && (
              <span style={{ color: '#9ca3af', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>+{visibleFields.length - 5} more</span>
            )}
          </div>

          {/* Roster badge */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, overflow: 'hidden' }}>
            <span className="badge" style={{
              background: totalRosterInGroup > 0 ? 'var(--brand-primary-light, #eff6ff)' : '#f3f4f6',
              color: totalRosterInGroup > 0 ? 'var(--brand-primary, #3b82f6)' : '#9ca3af',
              fontWeight: 600, fontSize: '0.75rem',
              whiteSpace: 'nowrap',
            }}>
              <Users size={11} style={{ marginRight: 4 }} />
              {hasChildren ? `${totalRosterInGroup}` : rosterCount}
            </span>
          </div>

          {/* Children count */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, overflow: 'hidden' }}>
            {hasChildren && (
              <span className="badge" style={{ background: '#dbeafe', color: '#2563eb', fontWeight: 600, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                {childCount}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, overflow: 'hidden' }}>
            <ChevronRight size={14} style={{ color: '#d1d5db' }} />
          </div>
        </div>

        {/* Render children when expanded */}
        {hasChildren && isExpanded && children.map(child => renderTreeRow(child))}
      </div>
    );
  };

  return (
    <div className="page-enter learners-page">
      {/* Header */}
      <div className="entity-header">
        <div className="entity-header-left">
          <div className="entity-icon-wrap" style={{ background: 'var(--brand-primary-light, #eff6ff)' }}>
            <School size={22} style={{ color: 'var(--brand-primary, #3b82f6)' }} />
          </div>
          <div>
            <h2>Classes</h2>
            <p className="text-muted">{records.length} classes, {totalRoster} learners enrolled</p>
          </div>
        </div>
        <div className="entity-header-actions">
          <div className="search-input-wrap">
            <Search size={15} className="search-icon" />
            <input type="text" className="search-input" placeholder="Search classes..." value={search} onChange={e => setSearch(e.target.value)} />
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
          <button className="btn btn-primary" onClick={() => setView('add')}><Plus size={15} /> Add Class</button>
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
        entityType="class"
        onFieldsChanged={onFieldsChanged}
        onLocalFieldsChange={onLocalFieldsChange}
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
          Showing {records.length} of {records.length} records
          {(filters.length > 0 || search) && (
            <button className="btn btn-ghost" onClick={() => { setFilters([]); setSearch(''); }} style={{ marginLeft: 8, fontSize: '0.75rem' }}>Clear all</button>
          )}
        </div>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
          background: 'var(--brand-primary-light, #eff6ff)', borderRadius: 10, marginBottom: 12,
          border: '1px solid var(--brand-primary-border, #bfdbfe)',
        }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-primary, #3b82f6)' }}>
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

      {/* Tree View */}
      <div className="entity-content card" style={{ padding: 0, overflowX: 'auto' }}>
        {loading ? (
          <LearnersListSkeleton />
        ) : tree.length === 0 ? (
          <div className="empty-state" style={{ padding: 40 }}>
            <div className="empty-state-icon"><School size={28} style={{ color: 'var(--brand-primary, #3b82f6)' }} /></div>
            <h3>{records.length === 0 ? 'No classes yet' : 'No matching records'}</h3>
            <p>{records.length === 0 ? 'Add your first class or import from a CSV file.' : 'Try adjusting your search or filters.'}</p>
            {records.length === 0 && (
              <div className="empty-state-actions">
                <button className="btn btn-primary" onClick={() => setView('add')}><Plus size={15} /> Add Class</button>
              </div>
            )}
          </div>
        ) : (
          <div>
            {/* Table header */}
            <div style={{
              display: 'grid', gridTemplateColumns: GRID_COLS, alignItems: 'center',
              padding: '8px 12px',
              borderBottom: '2px solid #e5e7eb', background: '#f9fafb',
              fontSize: '0.75rem', fontWeight: 600, color: '#6b7280',
            }}>
              <div />
              <div />
              <div />
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 16px', minWidth: 0, overflow: 'hidden' }}>
                {visibleFields.length > 0 ? (
                  visibleFields.slice(0, 5).map((field, i) => (
                    <span key={field.id} style={{ whiteSpace: 'nowrap', color: '#374151', fontWeight: i === 0 ? 600 : 500 }}>
                      {field.name}
                    </span>
                  ))
                ) : (
                  <span>Name</span>
                )}
                {visibleFields.length > 5 && (
                  <span style={{ color: '#9ca3af', whiteSpace: 'nowrap' }}>+{visibleFields.length - 5} more</span>
                )}
              </div>
              <div style={{ textAlign: 'center' }}>Roster</div>
              <div style={{ textAlign: 'center' }}>Streams</div>
              <div />
            </div>
            {/* Tree rows */}
            {tree.map(node => renderTreeRow(node))}
          </div>
        )}
      </div>

      {/* Widget Editor Modal */}
      {showWidgetEditor && (
        <WidgetEditor
          pageKey={PAGE_KEY}
          onClose={() => { setShowWidgetEditor(false); setWidgets(loadWidgetConfig(PAGE_KEY)); }}
        />
      )}
    </div>
  );
}
