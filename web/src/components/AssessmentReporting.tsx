// Assessment Reporting — Dynamic Pivot Engine
// Group-by dimension selector + computed stats per group + widget-driven KPIs/charts

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ArrowLeft, Filter, Settings2, ChevronRight } from 'lucide-react';

import KPICard from './KPICard';
import ChartWidget from './ChartWidget';
import WidgetEditor from './WidgetEditor';
import GradeScaleEditor from './GradeScaleEditor';
import {
  WidgetConfig, loadWidgetConfig, computeKPI, computeChartData,
  syncWidgetConfigFromServer,
} from '../lib/widgets';

const API = '/api';
const SCHOOL_ID = localStorage.getItem('anyschool_current_school') || '88374870-9175-4565-a876-f17c2e295519';
const PAGE_KEY = 'assessments';

type GroupByDimension = 'class' | 'subject' | 'term' | 'learner' | 'exam_name';

interface PivotGroup {
  label: string;
  groupId: string | null;
  count: number;
  avgScore: number;
  sumScore: number;
  medianScore: number | null;
  minScore: number | null;
  maxScore: number | null;
  passRate: number;
  scoreCount: number;
  passCount: number;
}

interface PivotMeta {
  groupBy: GroupByDimension;
  totalRecords: number;
  filters: { classId: string | null; subjectId: string | null; termId: string | null; learnerId: string | null };
}

interface Props {
  onBack: () => void;
}

const GROUP_BY_OPTIONS: Array<{ value: GroupByDimension; label: string }> = [
  { value: 'class', label: 'Class' },
  { value: 'subject', label: 'Subject' },
  { value: 'term', label: 'Term' },
  { value: 'learner', label: 'Learner' },
  { value: 'exam_name', label: 'Exam' },
];

// Drill-down: clicking a group row filters by it, then groups one level deeper.
// Term → Classes → Learners. Subject → Classes (same subject across classes).
const DRILL_NEXT: Partial<Record<GroupByDimension, { filter: 'class' | 'subject' | 'term'; next: GroupByDimension }>> = {
  term: { filter: 'term', next: 'class' },
  class: { filter: 'class', next: 'learner' },
  subject: { filter: 'subject', next: 'class' },
  exam_name: { filter: 'term', next: 'learner' },
};

// Synthetic group records are numeric aggregates — give them numeric types so
// widgets (avg/median/rank/…) validate, merged over the real field definitions.
const SYNTHETIC_NUMERIC_FIELDS = ['avg_score', 'sum_score', 'median_score', 'min_score', 'max_score', 'pass_rate', 'count']

export default function AssessmentReporting({ onBack }: Props) {
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>([]);
  const [subjects, setSubjects] = useState<Array<{ id: string; name: string }>>([]);
  const [terms, setTerms] = useState<Array<{ id: string; name: string }>>([]);

  const [filterClass, setFilterClass] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterTerm, setFilterTerm] = useState('');
  const [groupBy, setGroupBy] = useState<GroupByDimension>('class');

  const [groups, setGroups] = useState<PivotGroup[]>([]);
  const [meta, setMeta] = useState<PivotMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(true);

  const [widgets, setWidgets] = useState<WidgetConfig[]>([]);
  const [widgetsLoaded, setWidgetsLoaded] = useState(false);
  const [showWidgetEditor, setShowWidgetEditor] = useState(false);
  const [showGradeScale, setShowGradeScale] = useState(false);
  const [realFieldMap, setRealFieldMap] = useState<Record<string, any>>({});

  // Load filter options
  useEffect(() => {
    fetch(`${API}/subjects/list/${SCHOOL_ID}`).then(r => r.ok ? r.json() : null).then(d => {
      if (d) setSubjects((d.records || []).map((r: any) => ({ id: r.id, name: r.values?.subject_name || r.values?.name || 'Subject' })));
    }).catch(() => {});
    fetch(`${API}/terms/list/${SCHOOL_ID}`).then(r => r.ok ? r.json() : null).then(d => {
      if (d) setTerms((d.records || []).map((r: any) => ({ id: r.id, name: r.values?.term_name || r.values?.name || 'Term' })));
    }).catch(() => {});
    fetch(`${API}/classes/names/${SCHOOL_ID}`).then(r => r.ok ? r.json() : null).then(d => {
      if (d) setClasses((d.records || []).map((r: any) => ({ id: r.id, name: r.name || 'Class' })));
    }).catch(() => {});
  }, []);

  // Load widgets
  useEffect(() => {
    setWidgets(loadWidgetConfig(PAGE_KEY));
    syncWidgetConfigFromServer().then(() => {
      setWidgets(loadWidgetConfig(PAGE_KEY));
      setWidgetsLoaded(true);
    }).catch(() => { setWidgetsLoaded(true); });
  }, []);

  // Load real field definitions so widget aggregation choices type-check
  useEffect(() => {
    fetch(`${API}/assessments/fields/${SCHOOL_ID}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.fields) {
          setRealFieldMap(Object.fromEntries(d.fields.map((f: any) => [f.internalName, f])));
        }
      })
      .catch(() => {});
  }, []);

  // Fetch pivot data
  const loadPivot = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ groupBy });
      if (filterClass) params.set('classId', filterClass);
      if (filterSubject) params.set('subjectId', filterSubject);
      if (filterTerm) params.set('termId', filterTerm);

      const res = await fetch(`${API}/assessments/pivot/${SCHOOL_ID}?${params}`);
      if (res.ok) {
        const d = await res.json();
        setGroups(d.groups || []);
        setMeta(d.meta || null);
      }
    } catch (err) {
      console.error('Failed to load pivot:', err);
    } finally {
      setLoading(false);
    }
  }, [groupBy, filterClass, filterSubject, filterTerm]);

  useEffect(() => {
    loadPivot();
  }, [loadPivot]);

  const hasFilters = filterClass || filterSubject || filterTerm;

  // Field map for widgets: real fields + synthetic numeric group stats
  const fieldMap = useMemo(() => ({
    ...realFieldMap,
    ...Object.fromEntries(SYNTHETIC_NUMERIC_FIELDS.map(f => [f, { internalName: f, dataType: 'number', name: f } ])),
  }), [realFieldMap]);

  // Build synthetic records from pivot data for widget computation
  const syntheticRecords = useMemo(() => {
    return groups.map(g => ({
      values: {
        [groupBy]: g.label,
        avg_score: g.avgScore,
        sum_score: g.sumScore,
        median_score: g.medianScore ?? 0,
        min_score: g.minScore ?? 0,
        max_score: g.maxScore ?? 0,
        pass_rate: g.passRate,
        count: g.count,
      },
    }));
  }, [groups, groupBy]);

  // Drill down from a group row: filter by it, then group one level deeper
  const drillDown = (g: PivotGroup) => {
    const drill = DRILL_NEXT[groupBy];
    if (!drill || !g.groupId) return;
    if (drill.filter === 'term') setFilterTerm(g.groupId);
    else if (drill.filter === 'class') setFilterClass(g.groupId);
    else if (drill.filter === 'subject') setFilterSubject(g.groupId);
    setGroupBy(drill.next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const kpiWidgets = widgets.filter(w => w.type === 'kpi' && !w.hidden);
  const chartWidgets = widgets.filter(w => w.type === 'chart' && !w.hidden);

  // Summary stats
  const summaryStats = useMemo(() => {
    const totalRecords = groups.reduce((sum, g) => sum + g.count, 0);
    const totalScored = groups.reduce((sum, g) => sum + g.scoreCount, 0);
    const totalPassed = groups.reduce((sum, g) => sum + g.passCount, 0);
    const avgOfAvgs = groups.length > 0
      ? Math.round(groups.reduce((sum, g) => sum + g.avgScore, 0) / groups.length * 10) / 10
      : 0;
    const overallPassRate = totalRecords > 0 ? Math.round((totalPassed / totalRecords) * 100) : 0;
    return { totalRecords, totalScored, avgOfAvgs, overallPassRate };
  }, [groups]);

  return (
    <div className="page-enter">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ gap: 4 }}>
          <ArrowLeft size={15} /> Back
        </button>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Reporting</h3>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowFilters(!showFilters)} style={{ gap: 4 }}>
          <Filter size={14} /> Filters {hasFilters && <span className="badge" style={{ fontSize: '0.7rem' }}>Active</span>}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => setShowGradeScale(!showGradeScale)} style={{ gap: 4 }}>
          <Settings2 size={14} /> Grade Scale
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => setShowWidgetEditor(!showWidgetEditor)}>
          Widgets
        </button>
      </div>

      {/* Grade Scale Editor */}
      {showGradeScale && (
        <GradeScaleEditor onClose={() => setShowGradeScale(false)} />
      )}

      {/* Widget Editor */}
      {showWidgetEditor && (
        <WidgetEditor
          pageKey={PAGE_KEY}
          onClose={() => { setShowWidgetEditor(false); setWidgets(loadWidgetConfig(PAGE_KEY)); }}
        />
      )}

      {/* Filter + Group By Panel */}
      {showFilters && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {/* Group By selector */}
            <div className="form-group" style={{ flex: '0 0 auto', marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '0.8rem' }}>Group by</label>
              <select
                className="select"
                value={groupBy}
                onChange={e => setGroupBy(e.target.value as GroupByDimension)}
                style={{ fontSize: '0.85rem', minWidth: 130 }}
              >
                {GROUP_BY_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div style={{ width: 1, height: 24, background: 'var(--brand-border)', margin: '0 4px' }} />

            {/* Filters */}
            <div className="form-group" style={{ flex: 1, minWidth: 140, marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '0.8rem' }}>Class</label>
              <select className="select" value={filterClass} onChange={e => setFilterClass(e.target.value)} style={{ fontSize: '0.85rem' }}>
                <option value="">All classes</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: 140, marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '0.8rem' }}>Subject</label>
              <select className="select" value={filterSubject} onChange={e => setFilterSubject(e.target.value)} style={{ fontSize: '0.85rem' }}>
                <option value="">All subjects</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: 140, marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '0.8rem' }}>Term</label>
              <select className="select" value={filterTerm} onChange={e => setFilterTerm(e.target.value)} style={{ fontSize: '0.85rem' }}>
                <option value="">All terms</option>
                {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            {hasFilters && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => { setFilterClass(''); setFilterSubject(''); setFilterTerm(''); }}
                style={{ height: 36 }}
              >
                Clear all
              </button>
            )}
          </div>
        </div>
      )}

      {/* Summary KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
        <div className="card" style={{ padding: 16 }}>
          <p className="text-muted" style={{ fontSize: '0.8rem', marginBottom: 4 }}>Total Records</p>
          <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>{summaryStats.totalRecords.toLocaleString()}</p>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <p className="text-muted" style={{ fontSize: '0.8rem', marginBottom: 4 }}>Overall Pass Rate</p>
          <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: summaryStats.overallPassRate >= 50 ? '#16a34a' : '#dc2626' }}>
            {summaryStats.overallPassRate}%
          </p>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <p className="text-muted" style={{ fontSize: '0.8rem', marginBottom: 4 }}>Avg Score (of group avgs)</p>
          <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>{summaryStats.avgOfAvgs}</p>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <p className="text-muted" style={{ fontSize: '0.8rem', marginBottom: 4 }}>Groups</p>
          <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>{groups.length}</p>
        </div>
      </div>

      {/* Widget-driven KPIs */}
      {widgetsLoaded && kpiWidgets.length > 0 && (
        <div className="kpi-grid" style={{ gridTemplateColumns: `repeat(${Math.min(kpiWidgets.length, 3)}, 1fr)`, marginBottom: 16 }}>
          {kpiWidgets.map(w => {
            const result = computeKPI(syntheticRecords, w.dataField, w.aggregation, w.prefix, w.dataFields, fieldMap);
            return <KPICard key={w.id} config={w} value={result.displayValue} error={result.error} fieldMissing={result.fieldMissing} />;
          })}
        </div>
      )}

      {/* Widget-driven Charts */}
      {widgetsLoaded && chartWidgets.length > 0 && (
        <div className="chart-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(chartWidgets.length, 3)}, 1fr)`, gap: 16, marginBottom: 16 }}>
          {chartWidgets.map(w => {
            const result = computeChartData(syntheticRecords, w.dataField, w.groupByField || '', w.aggregation, w.dataFields, fieldMap);
            return <ChartWidget key={w.id} config={w} data={result.data} error={result.error} fieldMissing={result.fieldMissing} />;
          })}
        </div>
      )}

      {/* Pivot Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--brand-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
            Grouped by {GROUP_BY_OPTIONS.find(o => o.value === groupBy)?.label} ({groups.length} groups, {meta?.totalRecords || 0} records)
          </span>
        </div>
        <div style={{ overflow: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ minWidth: 180 }}>{GROUP_BY_OPTIONS.find(o => o.value === groupBy)?.label}</th>
                <th style={{ textAlign: 'right' }}>Records</th>
                <th style={{ textAlign: 'right' }}>Sum</th>
                <th style={{ textAlign: 'right' }}>Avg</th>
                <th style={{ textAlign: 'right' }}>Median</th>
                <th style={{ textAlign: 'right' }}>Min</th>
                <th style={{ textAlign: 'right' }}>Max</th>
                <th style={{ textAlign: 'right' }}>Pass Rate</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40 }}><div className="spinner" /></td></tr>
              ) : groups.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--brand-text-secondary)' }}>No data matches the current filters</td></tr>
              ) : groups.map(g => {
                const drill = DRILL_NEXT[groupBy];
                const canDrill = !!drill && !!g.groupId;
                return (
                  <tr
                    key={g.label}
                    onClick={() => canDrill && drillDown(g)}
                    style={{ cursor: canDrill ? 'pointer' : 'default' }}
                    title={canDrill ? `Drill into ${g.label}` : undefined}
                  >
                    <td style={{ fontWeight: 500 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {canDrill && <ChevronRight size={13} style={{ color: 'var(--brand-primary)', flexShrink: 0 }} />}
                        {g.label}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>{g.count}</td>
                    <td style={{ textAlign: 'right' }}>{g.sumScore ?? 0}</td>
                    <td style={{ textAlign: 'right' }}>{g.avgScore}</td>
                    <td style={{ textAlign: 'right' }}>{g.medianScore ?? '—'}</td>
                    <td style={{ textAlign: 'right' }}>{g.minScore ?? '—'}</td>
                    <td style={{ textAlign: 'right' }}>{g.maxScore ?? '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="badge" style={{
                        background: g.passRate >= 50 ? '#dcfce7' : '#fee2e2',
                        color: g.passRate >= 50 ? '#166534' : '#991b1b',
                        fontSize: '0.75rem',
                      }}>
                        {g.passRate}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
