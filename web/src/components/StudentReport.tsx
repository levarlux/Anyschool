// Per-Student Exam Report
// Selecting a student in an exam shows every subject's score/max/%/grade,
// the totals, and the class context (average, median, and this student's rank —
// ties share a position). Grades are derived from the school's grade scale at
// read time; with no scale defined, percentages are shown alone.

import { useState, useEffect } from 'react';
import { X, Loader2, AlertCircle } from 'lucide-react';

import { GradeBand } from './GradeScaleEditor';

const API = '/api';
const SCHOOL_ID = localStorage.getItem('anyschool_current_school') || '88374870-9175-4565-a876-f17c2e295519';

interface SubjectRow {
  subjectId: string | null;
  subjectName: string;
  score: number | null;
  max: number | null;
  weight: number | null;
  pct: number | null;
  grade: string | null;
}

interface ReportData {
  student: { id: string; name: string };
  exam: { name: string; termId: string };
  classes: Array<{ id: string; name: string }>;
  subjects: SubjectRow[];
  totals: { sum: number; max: number; pct: number | null; grade: string | null };
  classStats: { students: number; averagePct: number | null; medianPct: number | null; rank: number | null };
  gradeScale: GradeBand[];
}

interface Props {
  termId: string;
  examName: string;
  learnerId: string;
  learnerName?: string;
  onClose: () => void;
}

function StatBox({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 8, background: 'var(--brand-surface)',
      border: '1px solid var(--brand-border)', minWidth: 110,
    }}>
      <div style={{ fontSize: '0.7rem', color: 'var(--brand-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: '1.15rem', fontWeight: 700, marginTop: 2, color: accent }}>{value}</div>
    </div>
  );
}

export default function StudentReport({ termId, examName, learnerId, learnerName, onClose }: Props) {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ termId, examName, learnerId });
    fetch(`${API}/assessments/student-report/${SCHOOL_ID}?${params}`)
      .then(r => r.ok ? r.json().then(d => ({ ok: true, d })) : r.json().then(d => ({ ok: false, d })).catch(() => ({ ok: false, d: {} })))
      .then(({ ok, d }) => {
        if (cancelled) return;
        if (ok) setData(d);
        else setError(d.error || 'Failed to load report');
      })
      .catch(() => { if (!cancelled) setError('Network error'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [termId, examName, learnerId]);

  return (
    <div className="card" style={{ padding: 18, marginBottom: 16, border: '1px solid var(--brand-primary)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h4 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0 }}>
            {learnerName || data?.student?.name || 'Student'} — {examName}
          </h4>
          <p style={{ fontSize: '0.75rem', color: 'var(--brand-text-secondary)', marginTop: 2 }}>
            Per-student exam report{data?.classes?.length ? ` · ${data.classes.map(c => c.name).join(', ')}` : ''}
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ gap: 4 }}>
          <X size={14} /> Close
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <Loader2 size={18} className="spin" style={{ color: 'var(--brand-primary)' }} />
        </div>
      ) : error ? (
        <div style={{
          padding: '10px 14px', borderRadius: 6, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8,
          background: '#fef2f2', color: '#991b1b',
        }}>
          <AlertCircle size={15} /> {error}
        </div>
      ) : data ? (
        <>
          {/* No-scale prompt — never invent a default scale */}
          {data.gradeScale.length === 0 && (
            <div style={{
              padding: '7px 11px', borderRadius: 6, fontSize: '0.78rem', marginBottom: 12,
              background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a',
            }}>
              No grade scale defined yet — percentages are shown without grades. Set one in Reports &amp; Trends → Grade Scale.
            </div>
          )}

          {/* Subject breakdown */}
          <div style={{ border: '1px solid var(--brand-border)', borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
            <div style={{
              display: 'flex', padding: '7px 12px', background: 'var(--brand-surface)',
              fontSize: '0.72rem', fontWeight: 600, color: 'var(--brand-text-secondary)',
              textTransform: 'uppercase', letterSpacing: '0.04em',
            }}>
              <span style={{ flex: 1 }}>Subject</span>
              <span style={{ width: 90, textAlign: 'right' }}>Score</span>
              <span style={{ width: 70, textAlign: 'right' }}>Max</span>
              <span style={{ width: 65, textAlign: 'right' }}>%</span>
              <span style={{ width: 70, textAlign: 'center' }}>Grade</span>
            </div>
            {data.subjects.map((s, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', padding: '7px 12px',
                borderTop: '1px solid var(--brand-border)', fontSize: '0.85rem',
              }}>
                <span style={{ flex: 1, fontWeight: 500 }}>{s.subjectName}</span>
                <span style={{ width: 90, textAlign: 'right' }}>{s.score ?? '—'}</span>
                <span style={{ width: 70, textAlign: 'right', color: 'var(--brand-text-secondary)' }}>{s.max ?? '—'}</span>
                <span style={{ width: 65, textAlign: 'right', fontWeight: 600 }}>{s.pct !== null ? `${s.pct}%` : '—'}</span>
                <span style={{ width: 70, textAlign: 'center' }}>
                  {s.grade
                    ? <span className="badge" style={{ background: '#f0fdf4', color: '#166534', fontWeight: 600, fontSize: '0.72rem' }}>{s.grade}</span>
                    : <span style={{ color: 'var(--brand-text-secondary)', fontSize: '0.75rem' }}>—</span>}
                </span>
              </div>
            ))}
            {/* Totals */}
            <div style={{
              display: 'flex', alignItems: 'center', padding: '8px 12px',
              borderTop: '2px solid var(--brand-border)', background: 'var(--brand-surface)',
              fontSize: '0.85rem', fontWeight: 700,
            }}>
              <span style={{ flex: 1 }}>Total</span>
              <span style={{ width: 90, textAlign: 'right' }}>{data.totals.sum}</span>
              <span style={{ width: 70, textAlign: 'right', fontWeight: 500, color: 'var(--brand-text-secondary)' }}>{data.totals.max}</span>
              <span style={{ width: 65, textAlign: 'right' }}>{data.totals.pct !== null ? `${data.totals.pct}%` : '—'}</span>
              <span style={{ width: 70, textAlign: 'center' }}>
                {data.totals.grade
                  ? <span className="badge" style={{ background: '#dcfce7', color: '#166534', fontWeight: 700, fontSize: '0.78rem' }}>{data.totals.grade}</span>
                  : <span style={{ fontWeight: 500, color: 'var(--brand-text-secondary)' }}>—</span>}
              </span>
            </div>
          </div>

          {/* Class context */}
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--brand-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
              Class context{data.gradeScale.length === 0 ? ' (by percentage)' : ''}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <StatBox label="Class average" value={data.classStats.averagePct !== null ? `${data.classStats.averagePct}%` : '—'} />
              <StatBox label="Class median" value={data.classStats.medianPct !== null ? `${data.classStats.medianPct}%` : '—'} />
              <StatBox
                label="Rank in class"
                value={data.classStats.rank !== null ? `${data.classStats.rank} / ${data.classStats.students}` : '—'}
                accent="var(--brand-primary)"
              />
              <StatBox label="Overall" value={data.totals.pct !== null ? `${data.totals.pct}%` : '—'} />
            </div>
            <p style={{ fontSize: '0.72rem', color: 'var(--brand-text-secondary)', marginTop: 8 }}>
              Rank is computed over students in this class who have a score in this exam. Ties share a position (1, 2, 2, 4).
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}
