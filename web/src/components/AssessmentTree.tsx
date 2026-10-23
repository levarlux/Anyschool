// Assessment Tree — Expandable Tree View for All Results
// Hierarchy: Term (time) → Exam (one general name for ALL subjects/classes) → Class → Subject → Student
// Quick expand (chevron) + full detail view (click name)

import { useState, useEffect, useMemo } from 'react';
import { ChevronRight, ChevronDown, ExternalLink } from 'lucide-react';
import type { GradeBand } from './GradeScaleEditor';

const API = '/api';
const SCHOOL_ID = localStorage.getItem('anyschool_current_school') || '88374870-9175-4565-a876-f17c2e295519';

interface AssessmentRecord {
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

interface TreeNode {
  id: string;
  label: string;
  type: 'term' | 'exam' | 'class' | 'subject' | 'student';
  records: AssessmentRecord[];
  children?: TreeNode[];
  meta?: {
    count: number;
    avgScore: number;
    avgPct: number | null;
    passRate: number;
    gradedCount: number;
    totalCount: number;
    date?: string | null;
  };
}

// Per-record percentage — the basis for every average shown in the tree
function recPct(r: AssessmentRecord): number | null {
  if (r.score === null || r.score === undefined) return null;
  const max = r.maxScore !== null && r.maxScore !== undefined ? Number(r.maxScore) : null;
  const s = Number(r.score);
  if (max === null || isNaN(max) || max <= 0 || isNaN(s)) return null;
  return Math.round((s / max) * 1000) / 10;
}

// Band whose [min, max] contains the pct (highest band wins) — same rule as the API
function bandFor(pct: number | null, bands: GradeBand[]): GradeBand | null {
  if (pct === null || !bands || bands.length === 0) return null;
  const sorted = [...bands].sort((a, b) => b.min - a.min);
  return sorted.find(b => pct >= b.min && pct <= b.max) || null;
}

interface Props {
  records: AssessmentRecord[];
  loading: boolean;
  onSelectRecord?: (record: AssessmentRecord) => void;
}

function buildTree(records: AssessmentRecord[]): TreeNode[] {
  // Group by term
  const byTerm = new Map<string, AssessmentRecord[]>();
  for (const r of records) {
    const termKey = r.termId || '__no_term__';
    const arr = byTerm.get(termKey);
    if (arr) arr.push(r);
    else byTerm.set(termKey, [r]);
  }

  const terms: TreeNode[] = [];
  for (const [termId, termRecords] of byTerm) {
    const termName = termRecords[0]?.termName || 'Unknown Term';

    // Group by exam name within term
    const byExam = new Map<string, AssessmentRecord[]>();
    for (const r of termRecords) {
      const examKey = r.examName || '__no_exam__';
      const arr = byExam.get(examKey);
      if (arr) arr.push(r);
      else byExam.set(examKey, [r]);
    }

    const exams: TreeNode[] = [];
    for (const [examName, examRecords] of byExam) {
      // Group by class within exam
      const byClass = new Map<string, AssessmentRecord[]>();
      for (const r of examRecords) {
        const classKey = r.classId || '__no_class__';
        const arr = byClass.get(classKey);
        if (arr) arr.push(r);
        else byClass.set(classKey, [r]);
      }

      const classNodes: TreeNode[] = [];
      for (const [classId, classRecords] of byClass) {
        const className = classRecords[0]?.className || 'Unknown Class';

        // Group by subject within class — all students who took this exam in that subject
        const bySubject = new Map<string, AssessmentRecord[]>();
        for (const r of classRecords) {
          const subjectKey = r.subjectId || '__no_subject__';
          const arr = bySubject.get(subjectKey);
          if (arr) arr.push(r);
          else bySubject.set(subjectKey, [r]);
        }

        const subjectNodes: TreeNode[] = [];
        for (const [subjectId, subjectRecords] of bySubject) {
          const subjectName = subjectRecords[0]?.subjectName || 'Unknown Subject';

          // Students within subject
          const studentNodes: TreeNode[] = subjectRecords.map(r => ({
            id: r.id,
            label: r.learnerName || 'Unknown Student',
            type: 'student' as const,
            records: [r],
          }));

          subjectNodes.push({
            id: `${classId}:${subjectId}`,
            label: subjectName === 'Unknown Subject' ? 'No Subject' : subjectName,
            type: 'subject',
            records: subjectRecords,
            children: studentNodes,
            meta: computeGroupMeta(subjectRecords),
          });
        }
        // Stable order: subjects alphabetically
        subjectNodes.sort((a, b) => a.label.localeCompare(b.label));

        classNodes.push({
          id: classId,
          label: className,
          type: 'class',
          records: classRecords,
          children: subjectNodes,
          meta: computeGroupMeta(classRecords),
        });
      }
      // Stable order: classes alphabetically
      classNodes.sort((a, b) => a.label.localeCompare(b.label));

      exams.push({
        id: examName,
        label: examName === '__no_exam__' ? 'Unnamed Exam' : examName,
        type: 'exam',
        records: examRecords,
        children: classNodes,
        meta: computeGroupMeta(examRecords),
      });
    }
    // Stable order: exams alphabetically
    exams.sort((a, b) => a.label.localeCompare(b.label));

    terms.push({
      id: termId,
      label: termName,
      type: 'term',
      records: termRecords,
      children: exams,
      meta: computeGroupMeta(termRecords),
    });
  }

  // Sort terms by name
  terms.sort((a, b) => a.label.localeCompare(b.label));
  return terms;
}

function computeGroupMeta(records: AssessmentRecord[]) {
  let totalScore = 0;
  let scoreCount = 0;
  let passCount = 0;
  let gradedCount = 0;
  let pctSum = 0;
  let pctCount = 0;

  // Exam date ("the times") — shared by every record of the same exam/group
  let date: string | null = null;
  for (const r of records) {
    const raw = r.values?.date;
    if (!date && raw) {
      const d = new Date(raw);
      date = isNaN(d.getTime()) ? String(raw) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    if (r.status === 'Graded' || r.status === 'Completed') gradedCount++;
    const pct = recPct(r);
    if (pct !== null) { pctSum += pct; pctCount++; }
    if (r.score !== null) {
      totalScore += Number(r.score);
      scoreCount++;
      if (r.maxScore !== null && Number(r.maxScore) > 0) {
        if (Number(r.score) / Number(r.maxScore) >= 0.5) passCount++;
      } else {
        passCount++;
      }
    }
  }

  return {
    count: records.length,
    avgScore: scoreCount > 0 ? Math.round(totalScore / scoreCount * 10) / 10 : 0,
    avgPct: pctCount > 0 ? Math.round((pctSum / pctCount) * 10) / 10 : null,
    passRate: records.length > 0 ? Math.round((passCount / records.length) * 100) : 0,
    gradedCount,
    totalCount: records.length,
    date,
  };
}

export default function AssessmentTree({ records, loading, onSelectRecord }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [detailView, setDetailView] = useState<string | null>(null);
  const [bands, setBands] = useState<GradeBand[]>([]);

  // Grade scale (for grades + remarks in detail panels) — fetched once, cached by the browser
  useEffect(() => {
    fetch(`${API}/assessments/grade-scale/${SCHOOL_ID}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && Array.isArray(d.bands)) setBands(d.bands); })
      .catch(() => {});
  }, []);

  const tree = useMemo(() => buildTree(records), [records]);

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openDetail = (node: TreeNode) => {
    setDetailView(detailView === node.id ? null : node.id);
  };

  if (loading) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <div className="spinner" />
        <p style={{ marginTop: 8, color: 'var(--brand-text-secondary)', fontSize: '0.85rem' }}>Loading results...</p>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--brand-text-secondary)' }}>
        No assessment records yet. Use "New Exam" to create shell records, or "Enter Scores" to add results.
      </div>
    );
  }

  const renderNode = (node: TreeNode, depth: number = 0) => {
    const isExpanded = expanded.has(node.id);
    const isDetailView = detailView === node.id;
    const hasChildren = node.children && node.children.length > 0;
    const meta = node.meta;

    return (
      <div key={node.id}>
        {/* Node row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            paddingLeft: `${12 + depth * 20}px`,
            borderBottom: '1px solid var(--brand-border)',
            background: isDetailView ? '#f0f9ff' : 'transparent',
            cursor: 'pointer',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => { if (!isDetailView) e.currentTarget.style.background = 'var(--brand-surface)'; }}
          onMouseLeave={e => { if (!isDetailView) e.currentTarget.style.background = 'transparent'; }}
        >
          {/* Expand/collapse chevron */}
          {hasChildren ? (
            <button
              onClick={(e) => { e.stopPropagation(); toggleExpand(node.id); }}
              style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: 'var(--brand-text-secondary)' }}
            >
              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          ) : (
            <div style={{ width: 20 }} />
          )}

          {/* Label — click for detail view */}
          <div
            onClick={() => openDetail(node)}
            style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}
          >
            <span style={{
              fontWeight: depth === 0 ? 600 : depth === 1 ? 500 : 400,
              fontSize: depth === 0 ? '0.9rem' : '0.85rem',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {node.label}
            </span>

            {/* Type badge */}
            <span style={{
              fontSize: '0.65rem',
              padding: '1px 6px',
              borderRadius: 4,
              background: node.type === 'term' ? '#faf5ff' : node.type === 'exam' ? '#eff6ff' : node.type === 'class' ? '#f0fdf4' : node.type === 'subject' ? '#fdf2f8' : '#fffbeb',
              color: node.type === 'term' ? '#7c3aed' : node.type === 'exam' ? '#2563eb' : node.type === 'class' ? '#059669' : node.type === 'subject' ? '#ec4899' : '#d97706',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              fontWeight: 500,
              flexShrink: 0,
            }}>
              {node.type}
            </span>
          </div>

          {/* Meta info */}
          {meta && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: '0.75rem', color: 'var(--brand-text-secondary)', flexShrink: 0 }}>
              {meta.date && node.type !== 'term' && (
                <span style={{ fontWeight: 500, color: 'var(--brand-text-secondary)' }}>{meta.date}</span>
              )}
              <span>{meta.count} record{meta.count !== 1 ? 's' : ''}</span>
              {meta.avgScore > 0 && <span>Avg: {meta.avgScore}</span>}
              {meta.totalCount > 0 && (
                <span style={{
                  color: meta.passRate >= 50 ? '#16a34a' : '#dc2626',
                  fontWeight: 500,
                }}>
                  {meta.passRate}% pass
                </span>
              )}
              {meta.gradedCount < meta.totalCount && meta.gradedCount > 0 && (
                <span style={{ color: '#d97706' }}>{meta.gradedCount}/{meta.totalCount} graded</span>
              )}
            </div>
          )}

          {/* Detail view indicator */}
          {isDetailView && <ExternalLink size={14} style={{ color: 'var(--brand-primary)', flexShrink: 0 }} />}
        </div>

        {/* Expanded children */}
        {isExpanded && hasChildren && (
          <div>
            {node.children!.map(child => renderNode(child, depth + 1))}
          </div>
        )}

        {/* Detail view panel */}
        {isDetailView && (
          <div style={{
            padding: '12px 16px 12px ' + `${20 + depth * 20}px`,
            background: '#f0f9ff',
            borderBottom: '2px solid var(--brand-primary)',
          }}>
            <DetailPanel node={node} onSelectRecord={onSelectRecord} bands={bands} />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--brand-border)', fontWeight: 600, fontSize: '0.85rem' }}>
        All Results — {records.length} record{records.length !== 1 ? 's' : ''}
      </div>
      <div style={{ maxHeight: 600, overflow: 'auto' }}>
        {tree.map(node => renderNode(node))}
      </div>
    </div>
  );
}

// ─── Detail Panel ──────────────────────────────────────────────
// Level-aware: exam/class/term show group averages + per-child averages;
// subject/student show each student's score, %, grade and band remark.

function DetailPanel({ node, onSelectRecord, bands }: {
  node: TreeNode;
  onSelectRecord?: (r: AssessmentRecord) => void;
  bands: GradeBand[];
}) {
  const meta = node.meta;
  const avgBand = meta ? bandFor(meta.avgPct, bands) : null;

  const studentRow = (r: AssessmentRecord) => {
    const pct = recPct(r);
    const band = bandFor(pct, bands);
    return (
      <div
        key={r.id}
        onClick={() => onSelectRecord?.(r)}
        style={{
          padding: '7px 10px',
          background: 'var(--brand-bg)',
          borderRadius: 6,
          border: '1px solid var(--brand-border)',
          cursor: onSelectRecord ? 'pointer' : 'default',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexWrap: 'wrap',
          fontSize: '0.8rem',
        }}
      >
        <span style={{ fontWeight: 500, minWidth: 130 }}>{r.learnerName || 'Unknown Student'}</span>
        <span style={{ color: 'var(--brand-text-secondary)' }}>
          Score: <strong style={{ color: 'var(--brand-text)' }}>{r.score !== null ? `${r.score}/${r.maxScore ?? '?'}` : '—'}</strong>
        </span>
        {pct !== null && <span style={{ fontWeight: 600 }}>{pct}%</span>}
        {band && (
          <span className="badge" style={{ background: '#f0fdf4', color: '#166534', fontWeight: 600, fontSize: '0.72rem' }}>
            {band.label}
          </span>
        )}
        {band?.remark && (
          <span style={{ fontStyle: 'italic', color: 'var(--brand-text-secondary)', fontSize: '0.75rem' }}>
            {band.remark}
          </span>
        )}
        {r.status && (
          <span style={{
            fontSize: '0.7rem',
            color: r.status === 'Graded' ? '#16a34a' : r.status === 'Scheduled' ? '#d97706' : '#6b7280',
          }}>
            {r.status}
          </span>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* Summary — average % (+ derived grade & remark) for THIS group */}
      {meta && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 10, fontSize: '0.8rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span><strong>{meta.count}</strong> record{meta.count !== 1 ? 's' : ''}</span>
          {meta.avgPct !== null && (
            <span>
              Average: <strong>{meta.avgPct}%</strong>
              {avgBand && (
                <span className="badge" style={{ background: '#f0fdf4', color: '#166534', fontWeight: 600, fontSize: '0.72rem', marginLeft: 6 }}>
                  {avgBand.label}
                </span>
              )}
            </span>
          )}
          <span>Pass rate: <strong style={{ color: meta.passRate >= 50 ? '#16a34a' : '#dc2626' }}>{meta.passRate}%</strong></span>
          {meta.gradedCount > 0 && <span>Graded: <strong>{meta.gradedCount}</strong>/{meta.totalCount}</span>}
          {meta.date && node.type !== 'term' && <span>{meta.date}</span>}
          {avgBand?.remark && (
            <span style={{ fontStyle: 'italic', color: 'var(--brand-text-secondary)' }}>{avgBand.remark}</span>
          )}
        </div>
      )}

      {(node.type === 'subject' || node.type === 'student') ? (
        // Leaf-level detail: each student's marks for this subject (score, %, grade, remark)
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {node.records.map(studentRow)}
        </div>
      ) : (
        // Group-level detail: children with their averages
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: '0.8rem' }}>
          {node.children?.map(child => (
            <span key={child.id} style={{
              padding: '4px 9px',
              background: 'var(--brand-bg)',
              borderRadius: 5,
              border: '1px solid var(--brand-border)',
            }}>
              {child.label}{' '}
              <span style={{ color: 'var(--brand-text-secondary)' }}>
                ({child.meta?.count || 0})
                {child.meta?.avgPct !== null && child.meta?.avgPct !== undefined ? ` · ${child.meta.avgPct}%` : ''}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
