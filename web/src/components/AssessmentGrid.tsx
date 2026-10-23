// Assessment Grid Entry — Exam-First
// Rows = students sitting one exam; columns = that exam's subjects.
// Each cell shows the score being typed with its max underneath; Total / Max / %
// / Grade recompute live as scores are typed. Grades come from the school's own
// grade scale (derived at read time, never stored).

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ArrowLeft, Save, Loader2, CheckCircle2, AlertCircle, Settings2 } from 'lucide-react';

import GradeScaleEditor, { GradeBand } from './GradeScaleEditor';

const API = '/api';
const SCHOOL_ID = localStorage.getItem('anyschool_current_school') || '88374870-9175-4565-a876-f17c2e295519';

interface ExamSubject { id: string; name: string; maxScore: number | null; weight: number | null; }
interface ExamLearner { id: string; name: string; }
interface ExamClass { id: string; name: string; }
interface SubjectCell { score: any; assessmentId: string; }

interface Props {
  onBack: () => void;
}

// Same derivation rule as the API: highest band whose [min, max] contains the %
function deriveGrade(pct: number | null, bands: GradeBand[]): string | null {
  if (pct === null || bands.length === 0) return null;
  const sorted = [...bands].sort((a, b) => b.min - a.min);
  for (const b of sorted) {
    if (pct >= b.min && pct <= b.max) return b.label;
  }
  return null;
}

// Score rules (mirrors the API): a score must be a number, ≥ 0 and ≤ the subject's max.
function scoreError(raw: any, max: number | null): string | null {
  if (raw === '' || raw === null || raw === undefined) return null;
  const n = Number(raw);
  if (isNaN(n) || !isFinite(n)) return 'Not a number';
  if (n < 0) return 'Cannot be negative';
  if (max !== null && n > max) return `Max is ${max}`;
  return null;
}

export default function AssessmentGrid({ onBack }: Props) {
  const [terms, setTerms] = useState<Array<{ id: string; name: string }>>([]);

  const [selectedTerm, setSelectedTerm] = useState('');
  const [selectedExam, setSelectedExam] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [exams, setExams] = useState<Array<{ name: string; totalCount: number; gradedCount: number }>>([]);

  const [subjects, setSubjects] = useState<ExamSubject[]>([]);
  const [learners, setLearners] = useState<ExamLearner[]>([]);
  const [classes, setClasses] = useState<ExamClass[]>([]);
  const [cells, setCells] = useState<Record<string, Record<string, SubjectCell>>>({});
  const [gradeScale, setGradeScale] = useState<GradeBand[]>([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [dirtyLearners, setDirtyLearners] = useState<Set<string>>(new Set());
  const [showScaleEditor, setShowScaleEditor] = useState(false);

  // Load terms immediately (lightweight)
  useEffect(() => {
    fetch(`${API}/terms/list/${SCHOOL_ID}`).then(r => r.ok ? r.json() : null).then(d => {
      if (d) setTerms((d.records || []).map((r: any) => ({ id: r.id, name: r.values?.term_name || r.values?.name || 'Term' })));
    }).catch(() => {});
  }, []);

  // Load exams for the selected term
  useEffect(() => {
    setSelectedExam('');
    setExams([]);
    if (!selectedTerm) return;
    fetch(`${API}/assessments/grid-exams/${SCHOOL_ID}?termId=${encodeURIComponent(selectedTerm)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.exams) setExams(d.exams); })
      .catch(() => {});
  }, [selectedTerm]);

  // Load the exam grid (subjects × students) when exam selection changes
  const loadExam = useCallback(async () => {
    if (!selectedTerm || !selectedExam) return;
    setLoading(true);
    setSaveResult(null);
    try {
      const params = new URLSearchParams({ termId: selectedTerm, examName: selectedExam });
      if (selectedClass) params.set('classId', selectedClass);

      const res = await fetch(`${API}/assessments/exam-load/${SCHOOL_ID}?${params}`);
      if (res.ok) {
        const d = await res.json();
        setSubjects(d.subjects || []);
        setLearners(d.learners || []);
        setClasses(d.classes || []);
        setCells(d.cells || {});
        setGradeScale(d.gradeScale || []);
        setDirtyLearners(new Set());
      }
    } catch (err) {
      console.error('Failed to load exam:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedTerm, selectedExam, selectedClass]);

  useEffect(() => {
    loadExam();
  }, [loadExam]);

  const updateCell = (learnerId: string, subjectId: string, value: any) => {
    setCells(prev => ({
      ...prev,
      [learnerId]: {
        ...(prev[learnerId] || {}),
        [subjectId]: { score: value, assessmentId: prev[learnerId]?.[subjectId]?.assessmentId || '' },
      },
    }));
    setDirtyLearners(prev => new Set(prev).add(learnerId));
    setSaveResult(null);
  };

  // ── Overall computation (mirrors the API rules) ──────────────
  const overallMax = useMemo(() => {
    let sum = 0;
    let any = false;
    for (const s of subjects) {
      if (s.maxScore !== null && !isNaN(Number(s.maxScore))) { sum += Number(s.maxScore); any = true; }
    }
    return any ? sum : null;
  }, [subjects]);

  const weighted = useMemo(() =>
    subjects.some(s => s.weight !== null && !isNaN(Number(s.weight)) && Number(s.weight) > 0 && Number(s.weight) !== 1),
  [subjects]);

  const rowTotals = useCallback((learnerId: string) => {
    const row = cells[learnerId] || {};
    let sum = 0;
    let hasScore = false;
    let weightedNum = 0;
    let weightDen = 0;

    for (const s of subjects) {
      const raw = row[s.id]?.score;
      const score = raw === '' || raw === null || raw === undefined ? null : Number(raw);
      const max = s.maxScore !== null && !isNaN(Number(s.maxScore)) ? Number(s.maxScore) : null;
      const w = s.weight !== null && !isNaN(Number(s.weight)) && Number(s.weight) > 0 ? Number(s.weight) : 1;

      // Invalid entries (negative / above max) never feed the totals — they show
      // as an inline error on the cell instead.
      if (score !== null && scoreError(raw, max) !== null) continue;
      if (score !== null && !isNaN(score)) { sum += score; hasScore = true; }
      if (max !== null && max > 0 && score !== null && !isNaN(score)) {
        weightedNum += (score / max) * w;
        weightDen += w;
      }
    }

    let pct: number | null = null;
    if (hasScore) {
      if (weighted) {
        if (weightDen > 0) pct = Math.round((weightedNum / weightDen) * 1000) / 10;
      } else if (overallMax !== null && overallMax > 0) {
        pct = Math.round((sum / overallMax) * 1000) / 10;
      }
    }

    return { sum: hasScore ? Math.round(sum * 100) / 100 : null, max: overallMax, pct, grade: deriveGrade(pct, gradeScale) };
  }, [cells, subjects, overallMax, weighted, gradeScale]);

  // Save dirty learners' scores via the batched exam-save endpoint
  const handleSave = async () => {
    if (dirtyLearners.size === 0 || !selectedTerm || !selectedExam) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const scores: Record<string, Record<string, any>> = {};
      for (const learnerId of dirtyLearners) {
        const row = cells[learnerId] || {};
        scores[learnerId] = {};
        for (const s of subjects) {
          const v = row[s.id]?.score;
          scores[learnerId][s.id] = v === undefined || v === null ? '' : v;
        }
      }

      const res = await fetch(`${API}/assessments/exam-save/${SCHOOL_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ termId: selectedTerm, examName: selectedExam, scores }),
      });
      if (res.ok) {
        const d = await res.json();
        setSaveResult({ type: 'success', message: `Saved — ${d.updated} updated, ${d.created} created (${dirtyLearners.size} student${dirtyLearners.size !== 1 ? 's' : ''})` });
        setDirtyLearners(new Set());
      } else {
        const err = await res.json().catch(() => ({}) as any);
        setSaveResult({ type: 'error', message: err.error || 'Save failed' });
      }
    } catch (e: any) {
      setSaveResult({ type: 'error', message: e.message || 'Network error' });
    } finally {
      setSaving(false);
    }
  };

  const hasGrades = gradeScale.length > 0;
  const ready = !!selectedTerm && !!selectedExam;

  // Every currently-invalid cell (drives the inline error + the save guard)
  const invalidCells = useMemo(() => {
    const out: string[] = [];
    for (const l of learners) {
      const row = cells[l.id] || {};
      for (const s of subjects) {
        const err = scoreError(row[s.id]?.score, s.maxScore !== null ? Number(s.maxScore) : null);
        if (err) out.push(`${l.name} — ${s.name}: ${err}`);
      }
    }
    return out;
  }, [cells, learners, subjects]);

  return (
    <div className="page-enter">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ gap: 4 }}>
          <ArrowLeft size={15} /> Back
        </button>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Enter Scores</h3>
        {dirtyLearners.size > 0 && (
          <span className="badge" style={{ background: '#fef3c7', color: '#92400e' }}>
            {dirtyLearners.size} unsaved student{dirtyLearners.size !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Selectors */}
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ flex: 1, minWidth: 160, marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '0.8rem' }}>Term *</label>
            <select className="select" value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)} style={{ fontSize: '0.85rem' }}>
              <option value="">Select term...</option>
              {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: 2, minWidth: 200, marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '0.8rem' }}>Exam *</label>
            <select className="select" value={selectedExam} onChange={e => setSelectedExam(e.target.value)} style={{ fontSize: '0.85rem' }} disabled={!selectedTerm}>
              <option value="">{selectedTerm ? (exams.length ? 'Select exam...' : 'No exams in this term') : 'Select term first'}</option>
              {exams.map(e => (
                <option key={e.name} value={e.name}>
                  {e.name} ({e.gradedCount}/{e.totalCount} graded)
                </option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: 160, marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '0.8rem' }}>Class (optional)</label>
            <select className="select" value={selectedClass} onChange={e => setSelectedClass(e.target.value)} style={{ fontSize: '0.85rem' }}>
              <option value="">All classes</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowScaleEditor(!showScaleEditor)} style={{ gap: 4, height: 36 }}>
            <Settings2 size={14} /> Grade Scale
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || !ready || dirtyLearners.size === 0 || invalidCells.length > 0} style={{ gap: 4, height: 36 }}>
            {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
            Save All
          </button>
        </div>

        {invalidCells.length > 0 && (
          <div style={{
            marginTop: 12, padding: '8px 12px', borderRadius: 6, fontSize: '0.85rem',
            display: 'flex', alignItems: 'center', gap: 6,
            background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca',
          }}>
            <AlertCircle size={14} />
            <span>
              {invalidCells.length} invalid score{invalidCells.length !== 1 ? 's' : ''}: {invalidCells[0]}
              {invalidCells.length > 1 ? ` (+${invalidCells.length - 1} more)` : ''}
              {' — '}scores must be between 0 and the subject's maximum. Fix to save.
            </span>
          </div>
        )}

        {saveResult && (
          <div style={{
            marginTop: 12, padding: '8px 12px', borderRadius: 6, fontSize: '0.85rem',
            display: 'flex', alignItems: 'center', gap: 6,
            background: saveResult.type === 'success' ? '#f0fdf4' : '#fef2f2',
            color: saveResult.type === 'success' ? '#166534' : '#991b1b',
          }}>
            {saveResult.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            {saveResult.message}
          </div>
        )}
      </div>

      {/* Grade scale editor */}
      {showScaleEditor && (
        <GradeScaleEditor
          onClose={() => setShowScaleEditor(false)}
          onSaved={bands => setGradeScale(bands)}
        />
      )}

      {/* No-grade-scale prompt (per spec: show % and a prompt, never invent a scale) */}
      {ready && !loading && !hasGrades && (
        <div style={{
          padding: '8px 12px', borderRadius: 6, fontSize: '0.8rem', marginBottom: 12,
          background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a',
        }}>
          No grade scale defined yet — percentages are shown without grades.{' '}
          <button className="btn btn-ghost btn-sm" onClick={() => setShowScaleEditor(true)} style={{ padding: 0, textDecoration: 'underline', color: '#92400e' }}>
            Set one now
          </button>.
        </div>
      )}

      {/* Grid */}
      {!ready ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--brand-text-secondary)' }}>
          Select a Term and Exam to load the score sheet
        </div>
      ) : loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div className="spinner" />
          <p style={{ marginTop: 8, color: 'var(--brand-text-secondary)', fontSize: '0.85rem' }}>Loading exam...</p>
        </div>
      ) : learners.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--brand-text-secondary)' }}>
          No students are assigned to this exam.
        </div>
      ) : (
        <div className="card" style={{ overflow: 'auto' }}>
          <table className="table" style={{ minWidth: '100%' }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, background: 'var(--brand-surface)', zIndex: 1, minWidth: 170 }}>
                  Student
                </th>
                {subjects.map(s => (
                  <th key={s.id} style={{ minWidth: 110, textAlign: 'center' }}>
                    <div>{s.name}</div>
                    <div style={{ fontSize: '0.7rem', fontWeight: 400, color: 'var(--brand-text-secondary)' }}>
                      {s.maxScore !== null ? `/${s.maxScore}` : '/ max?'}
                      {s.weight !== null && Number(s.weight) !== 1 ? ` · w${s.weight}` : ''}
                    </div>
                  </th>
                ))}
                <th style={{ minWidth: 80, textAlign: 'right' }}>Total</th>
                <th style={{ minWidth: 70, textAlign: 'right' }}>Max</th>
                <th style={{ minWidth: 65, textAlign: 'right' }}>%</th>
                <th style={{ minWidth: 65, textAlign: 'center' }}>Grade</th>
              </tr>
            </thead>
            <tbody>
              {learners.map(l => {
                const row = cells[l.id] || {};
                const t = rowTotals(l.id);
                const isDirty = dirtyLearners.has(l.id);
                return (
                  <tr key={l.id} style={isDirty ? { background: '#fffbeb' } : undefined}>
                    <td style={{
                      position: 'sticky', left: 0, background: 'var(--brand-bg)',
                      fontWeight: 500, fontSize: '0.85rem',
                    }}>
                      {l.name}
                      {isDirty && <span style={{ marginLeft: 6, fontSize: '0.65rem', color: '#d97706' }}>●</span>}
                    </td>
                    {subjects.map(s => {
                      const v = row[s.id]?.score ?? '';
                      const err = scoreError(v, s.maxScore !== null ? Number(s.maxScore) : null);
                      return (
                        <td key={s.id} style={{ textAlign: 'center' }}>
                          <input
                            type="number"
                            className="input"
                            value={v}
                            placeholder={s.maxScore !== null ? String(s.maxScore) : '—'}
                            onChange={e => updateCell(l.id, s.id, e.target.value === '' ? '' : Number(e.target.value))}
                            title={err || undefined}
                            style={{
                              fontSize: '0.8rem', padding: '4px 6px', width: 76, textAlign: 'center',
                              ...(err ? { border: '1px solid #dc2626', background: '#fef2f2', color: '#991b1b' } : {}),
                            }}
                          />
                          {err && (
                            <div style={{ fontSize: '0.62rem', color: '#dc2626', marginTop: 2, whiteSpace: 'nowrap', fontWeight: 500 }}>
                              {err}
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td style={{ textAlign: 'right', fontSize: '0.85rem', fontWeight: 600 }}>
                      {t.sum ?? '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: '0.85rem', color: 'var(--brand-text-secondary)' }}>
                      {t.max ?? '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: '0.85rem', fontWeight: 600 }}>
                      {t.pct !== null ? `${t.pct}%` : '—'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {t.grade ? (
                        <span className="badge" style={{ background: '#f0fdf4', color: '#166534', fontWeight: 600, fontSize: '0.75rem' }}>
                          {t.grade}
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--brand-text-secondary)' }}>
                          {t.pct !== null ? `${t.pct}%` : '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td style={{
                  position: 'sticky', left: 0, background: 'var(--brand-surface)',
                  fontWeight: 600, fontSize: '0.8rem', padding: '8px 12px',
                }}>
                  Overall
                </td>
                <td colSpan={subjects.length} style={{
                  background: 'var(--brand-surface)', fontSize: '0.78rem',
                  color: 'var(--brand-text-secondary)', padding: '8px 12px',
                }}>
                  {weighted ? 'Weighted average of subject %' : 'Total ÷ overall max'}
                  {weighted && ' (weights active)'}
                </td>
                <td style={{ background: 'var(--brand-surface)', textAlign: 'right', fontWeight: 700, fontSize: '0.85rem' }}>
                  {(() => {
                    let sum = 0; let any = false;
                    for (const l of learners) { const t = rowTotals(l.id); if (t.sum !== null) { sum += t.sum; any = true; } }
                    return any ? Math.round(sum * 100) / 100 : '—';
                  })()}
                </td>
                <td style={{ background: 'var(--brand-surface)', textAlign: 'right', fontWeight: 700, fontSize: '0.85rem' }}>
                  {overallMax ?? '—'}
                </td>
                <td colSpan={2} style={{ background: 'var(--brand-surface)' }} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
