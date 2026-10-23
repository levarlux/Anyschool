// Assessments Pillar — Doc 20
// All Results (expandable tree) + Enter Scores (grid) + Reports & Trends (pivot engine)
// + New Exam wizard for exam-first workflow

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ClipboardCheck, Search, Settings2,
  Grid3X3, BarChart3, List, Plus,
} from 'lucide-react';

import AssessmentGrid from './AssessmentGrid';
import AssessmentReporting from './AssessmentReporting';
import AssessmentTree from './AssessmentTree';
import ExamWizard from './ExamWizard';
import StudentReport from './StudentReport';
import KPICard from './KPICard';
import ChartWidget from './ChartWidget';
import WidgetEditor from './WidgetEditor';
import FieldManager from './FieldManager';
import { KPISkeleton, ChartSkeleton } from './Skeleton';

import { useEntityFields } from '../lib/useEntityFields';
import { loadCache, saveCache } from '../lib/cache';
import {
  WidgetConfig, loadWidgetConfig, computeKPI, computeChartData,
  syncWidgetConfigFromServer,
} from '../lib/widgets';

const API = '/api';
const SCHOOL_ID = localStorage.getItem('anyschool_current_school') || '88374870-9175-4565-a876-f17c2e295519';
const PAGE_KEY = 'assessments';

type ViewMode = 'list' | 'grid' | 'reporting' | 'exam-wizard';

const TAB_SUBTITLES: Record<ViewMode, string> = {
  list: 'Expandable tree of every assessment — Term → Exam → Class → Student.',
  grid: 'Record test scores for a class, subject, and term.',
  reporting: 'Dynamic pivot reporting — pick a dimension, apply filters, drill deeper.',
  'exam-wizard': 'Create an exam shell (Scheduled records) before entering scores.',
};

interface AllResultsRecord {
  id: string;
  values: Record<string, any>;
  score: number | null;
  maxScore: number | null;
  status: string | null;
  examName: string | null;
  learnerId: string | null;
  learnerName: string | null;
  subjectId: string | null;
  subjectName: string | null;
  termId: string | null;
  termName: string | null;
  classId: string | null;
  className: string | null;
}

export default function AssessmentsPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [search, setSearch] = useState('');
  const [showFieldManager, setShowFieldManager] = useState(false);
  const [showWidgetEditor, setShowWidgetEditor] = useState(false);
  const [widgets, setWidgets] = useState<WidgetConfig[]>([]);

  // All Results tree data
  const [treeRecords, setTreeRecords] = useState<AllResultsRecord[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);

  // Per-student report (opened from the tree)
  const [reportFor, setReportFor] = useState<{ termId: string; examName: string; learnerId: string; learnerName?: string } | null>(null);

  const fetchList = useCallback(async () => {
    const res = await fetch(`${API}/assessments/list/${SCHOOL_ID}`);
    if (!res.ok) return { records: [], fields: [], sections: [] };
    const data = await res.json();
    // Safety net (same as learners): never let base64 blobs reach localStorage —
    // a big payload blows the ~5MB quota, saveCache fails, and the page loses its cache.
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

  // 'assessment' (singular) matches entity_types.internal_name so the version-marker
  // staleness check works — same key the learners page uses via 'learner'.
  const {
    fields, records, loading, onFieldsChanged,
    onLocalFieldsChange, onVisibilityChanged,
  } = useEntityFields('assessment', fetchList);

  // Load widgets — render from local config immediately, then sync from server
  useEffect(() => {
    // Remove the legacy misspelled cache key written by older builds
    // (getCacheKey used to produce 'anyschool_assessmentss_...') — it's dead weight
    // that can push localStorage over quota and break caching entirely.
    try { localStorage.removeItem(`anyschool_assessmentss_${SCHOOL_ID}`); } catch {}
    setWidgets(loadWidgetConfig(PAGE_KEY));
    syncWidgetConfigFromServer().then(() => {
      setWidgets(loadWidgetConfig(PAGE_KEY));
    }).catch(() => {});
  }, []);

  // ─── All Results tree — stale-while-revalidate cache ───
  // Same pattern as the learners page: render cached data instantly on entry,
  // check a cheap version marker in the background, refetch only if stale.
  const TREE_CACHE_KEY = `anyschool_assessments_tree_${SCHOOL_ID}`;

  const loadTree = useCallback(async (force = false) => {
    const fetchTree = async (): Promise<AllResultsRecord[]> => {
      const res = await fetch(`${API}/assessments/all-results/${SCHOOL_ID}`);
      if (!res.ok) return [];
      const d = await res.json().catch(() => null);
      return d && Array.isArray(d.records) ? d.records : [];
    };
    const fetchTreeVersion = async () => {
      const res = await fetch(`${API}/assessments/version/${SCHOOL_ID}`);
      if (!res.ok) return null;
      return res.json().catch(() => null);
    };

    if (!force) {
      const cached = loadCache<{ records: AllResultsRecord[] }>(TREE_CACHE_KEY);
      if (cached) {
        // 1. Paint from cache immediately — no waiting.
        setTreeRecords(cached.data.records || []);
        setTreeLoading(false);
        // 2. Revalidate in the background: cheap version check (record counts/timestamps
        //    + field_values updatedAt, so fresh scores are picked up). Never blocks paint.
        fetchTreeVersion().then(v => {
          const server = v?.versions?.assessment;
          const prev = cached.version?.versions?.assessment;
          const stale = !v || !server || !prev ||
            server.count !== prev.count ||
            server.lastUpdatedAt !== prev.lastUpdatedAt ||
            v.fieldValuesUpdatedAt !== cached.version?.fieldValuesUpdatedAt ||
            Date.now() - cached.cachedAt > 5 * 60_000; // belt-and-braces
          if (!stale) return;
          return fetchTree().then(fresh => {
            setTreeRecords(fresh);
            return fetchTreeVersion().then(v2 =>
              saveCache(TREE_CACHE_KEY, { records: fresh }, v2 || v || {}));
          });
        }).catch(() => {});
        return;
      }
    }

    // No cache (first visit) or forced refresh — show loading, then cache the result.
    setTreeLoading(true);
    try {
      const fresh = await fetchTree();
      setTreeRecords(fresh);
      const v = await fetchTreeVersion().catch(() => null);
      saveCache(TREE_CACHE_KEY, { records: fresh }, v || {});
    } catch {
      setTreeRecords([]);
    } finally {
      setTreeLoading(false);
    }
  }, []);

  // Load tree data when switching to list view (instant when cached)
  useEffect(() => {
    if (viewMode === 'list') loadTree();
  }, [viewMode, loadTree]);

  const fieldMap = useMemo(() => Object.fromEntries(fields.map(f => [f.internalName, f])), [fields]);

  // Filter tree records by search
  const filteredTreeRecords = useMemo(() => {
    if (!search) return treeRecords;
    const q = search.toLowerCase();
    return treeRecords.filter(r =>
      (r.learnerName || '').toLowerCase().includes(q) ||
      (r.examName || '').toLowerCase().includes(q) ||
      (r.className || '').toLowerCase().includes(q) ||
      (r.subjectName || '').toLowerCase().includes(q) ||
      (r.termName || '').toLowerCase().includes(q)
    );
  }, [treeRecords, search]);

  return (
    <div className="page-enter assessments-page">
      {/* Mode Switcher */}
      <div className="entity-header">
        <div className="entity-header-left">
          <div className="entity-icon-wrap" style={{ background: '#fdf2f8' }}>
            <ClipboardCheck size={22} style={{ color: '#ec4899' }} />
          </div>
          <div>
            <h2>Assessments</h2>
            <p className="text-muted">{TAB_SUBTITLES[viewMode]}</p>
          </div>
        </div>
        <div className="entity-header-actions">
          <div className="mode-switcher" style={{ display: 'flex', gap: 4, background: 'var(--brand-surface)', borderRadius: 8, padding: 3 }}>
            <button
              className={`btn btn-sm ${viewMode === 'list' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setViewMode('list')}
              style={{ gap: 4 }}
            >
              <List size={14} /> All Results
            </button>
            <button
              className={`btn btn-sm ${viewMode === 'grid' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setViewMode('grid')}
              style={{ gap: 4 }}
            >
              <Grid3X3 size={14} /> Enter Scores
            </button>
            <button
              className={`btn btn-sm ${viewMode === 'reporting' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setViewMode('reporting')}
              style={{ gap: 4 }}
            >
              <BarChart3 size={14} /> Reports & Trends
            </button>
          </div>

          {/* New Exam button */}
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setViewMode('exam-wizard')}
            style={{ gap: 4 }}
          >
            <Plus size={14} /> New Exam
          </button>

          {viewMode === 'list' && (
            <>
              <div className="search-input-wrap">
                <Search size={15} className="search-icon" />
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search assessments..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <button className="btn btn-secondary" onClick={() => setShowFieldManager(!showFieldManager)}>
                <Settings2 size={15} /> Fields
              </button>
              <button className="btn btn-secondary" onClick={() => setShowWidgetEditor(!showWidgetEditor)}>
                <Settings2 size={15} /> Widgets
              </button>
            </>
          )}
        </div>
      </div>

      {/* Field Manager */}
      {showFieldManager && (
        <FieldManager
          entityType="assessment"
          fields={fields}
          onFieldsChanged={onFieldsChanged}
          onLocalFieldsChange={onLocalFieldsChange}
          onVisibilityChanged={onVisibilityChanged}
        />
      )}

      {/* Widget Editor */}
      {showWidgetEditor && (
        <WidgetEditor
          pageKey={PAGE_KEY}
          onClose={() => { setShowWidgetEditor(false); setWidgets(loadWidgetConfig(PAGE_KEY)); }}
        />
      )}

      {/* Content — shell renders immediately; only the content area skeletons
          while first-ever load runs (same as the learners page). */}
      {viewMode === 'list' && (
        <>
          {reportFor && (
            <StudentReport
              termId={reportFor.termId}
              examName={reportFor.examName}
              learnerId={reportFor.learnerId}
              learnerName={reportFor.learnerName}
              onClose={() => setReportFor(null)}
            />
          )}
          {loading ? (
            <div style={{ padding: 20 }}>
              <KPISkeleton count={3} />
              <ChartSkeleton count={2} />
            </div>
          ) : (
            <TreeView
              records={filteredTreeRecords}
              loading={treeLoading}
              widgets={widgets}
              recordsForWidgets={records}
              fieldMap={fieldMap}
              onSelectStudent={r => {
                if (r.learnerId && r.examName && r.termId) {
                  setReportFor({
                    termId: r.termId,
                    examName: r.examName,
                    learnerId: r.learnerId,
                    learnerName: r.learnerName || undefined,
                  });
                }
              }}
            />
          )}
        </>
      )}

      {viewMode === 'grid' && (
        <AssessmentGrid onBack={() => setViewMode('list')} />
      )}

      {viewMode === 'reporting' && (
        <AssessmentReporting onBack={() => setViewMode('list')} />
      )}

      {viewMode === 'exam-wizard' && (
        <ExamWizard
          onBack={() => setViewMode('list')}
          onCreated={() => {
            // Drop the cached tree so the list view reloads fresh for the new exam
            try { localStorage.removeItem(TREE_CACHE_KEY); } catch {}
            setViewMode('list');
          }}
        />
      )}
    </div>
  );
}

// ─── Tree View with Widgets ────────────────────────────────────

function TreeView({
  records, loading, widgets, recordsForWidgets, fieldMap, onSelectStudent,
}: {
  records: AllResultsRecord[];
  loading: boolean;
  widgets: WidgetConfig[];
  recordsForWidgets: any[];
  fieldMap: Record<string, any>;
  onSelectStudent?: (r: AllResultsRecord) => void;
}) {
  const kpiWidgets = widgets.filter(w => w.type === 'kpi' && !w.hidden);
  const chartWidgets = widgets.filter(w => w.type === 'chart' && !w.hidden);

  return (
    <div>
      {/* KPI Widgets */}
      {kpiWidgets.length > 0 && (
        <div className="kpi-grid" style={{ gridTemplateColumns: `repeat(${Math.min(kpiWidgets.length, 3)}, 1fr)`, marginBottom: 16 }}>
          {kpiWidgets.map(w => {
            const result = computeKPI(recordsForWidgets, w.dataField, w.aggregation, w.prefix, w.dataFields, fieldMap);
            return <KPICard key={w.id} config={w} value={result.displayValue} error={result.error} fieldMissing={result.fieldMissing} />;
          })}
        </div>
      )}

      {/* Chart Widgets */}
      {chartWidgets.length > 0 && (
        <div className="chart-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(chartWidgets.length, 3)}, 1fr)`, gap: 16, marginBottom: 16 }}>
          {chartWidgets.map(w => {
            const result = computeChartData(recordsForWidgets, w.dataField, w.groupByField || '', w.aggregation, w.dataFields, fieldMap);
            return <ChartWidget key={w.id} config={w} data={result.data} error={result.error} fieldMissing={result.fieldMissing} />;
          })}
        </div>
      )}

      {/* Tree */}
      <AssessmentTree
        records={records}
        loading={loading}
        onSelectRecord={onSelectStudent}
      />
    </div>
  );
}
