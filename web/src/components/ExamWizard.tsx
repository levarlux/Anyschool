// Exam Wizard — Exam-First Creation Workflow
// Step 1: Define exam (name, term, subjects with max scores / optional weights)
// Step 2: Assign students
// Step 3: Confirm → creates one Scheduled shell record per learner per subject

import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, ArrowRight, Check, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

const API = '/api';
const SCHOOL_ID = localStorage.getItem('anyschool_current_school') || '88374870-9175-4565-a876-f17c2e295519';

// Never let "Creating..." hang forever — fail with a clear message instead.
const CREATE_TIMEOUT_MS = 60_000;

interface Props {
  onBack: () => void;
  onCreated: () => void;
}

interface Term { id: string; name: string; }
interface Subject { id: string; name: string; }
interface Class { id: string; name: string; }
interface Learner { id: string; name: string; }

type Step = 'define' | 'assign' | 'confirm';

export default function ExamWizard({ onBack, onCreated }: Props) {
  const [step, setStep] = useState<Step>('define');
  const [terms, setTerms] = useState<Term[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [learners, setLearners] = useState<Learner[]>([]);
  const [loadingLearners, setLoadingLearners] = useState(false);

  const [examName, setExamName] = useState('');
  const [examDate, setExamDate] = useState(''); // optional — shown as the exam's time in All Results
  const [selectedTerm, setSelectedTerm] = useState('');
  const [selectedSubjects, setSelectedSubjects] = useState<Set<string>>(new Set());
  const [defaultMax, setDefaultMax] = useState('100');
  const [subjectMaxes, setSubjectMaxes] = useState<Record<string, string>>({});
  const [subjectWeights, setSubjectWeights] = useState<Record<string, string>>({});
  const [weightingEnabled, setWeightingEnabled] = useState(false); // school-level choice, off by default

  const [selectedClasses, setSelectedClasses] = useState<Set<string>>(new Set());
  const [selectedLearners, setSelectedLearners] = useState<Set<string>>(new Set());
  const [assignMode, setAssignMode] = useState<'class' | 'individual'>('class');

  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Load dropdowns
  useEffect(() => {
    fetch(`${API}/terms/list/${SCHOOL_ID}`).then(r => r.ok ? r.json() : null).then(d => {
      if (d) setTerms((d.records || []).map((r: any) => ({ id: r.id, name: r.values?.term_name || r.values?.name || 'Term' })));
    }).catch(() => {});
    fetch(`${API}/subjects/list/${SCHOOL_ID}`).then(r => r.ok ? r.json() : null).then(d => {
      if (d) setSubjects((d.records || []).map((r: any) => ({ id: r.id, name: r.values?.subject_name || r.values?.name || 'Subject' })));
    }).catch(() => {});
    fetch(`${API}/classes/names/${SCHOOL_ID}`).then(r => r.ok ? r.json() : null).then(d => {
      if (d) setClasses((d.records || []).map((r: any) => ({ id: r.id, name: r.name || 'Class' })));
    }).catch(() => {});
  }, []);

  // Load learners when switching to individual mode or when classes are selected
  useEffect(() => {
    if (assignMode === 'individual' || (assignMode === 'class' && selectedClasses.size > 0)) {
      setLoadingLearners(true);
      const classIds = [...selectedClasses].join(',');
      const url = classIds
        ? `${API}/learners/list/${SCHOOL_ID}?classId=${classIds}`
        : `${API}/learners/list/${SCHOOL_ID}`;
      fetch(url)
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (d) setLearners((d.records || []).map((r: any) => ({
            id: r.id,
            name: r.values?.full_name || r.values?.name ||
              ((r.values?.first_name || '') + ' ' + (r.values?.last_name || '')).trim() || 'Learner',
          })));
        })
        .catch(() => {})
        .finally(() => setLoadingLearners(false));
    }
  }, [assignMode, selectedClasses]);

  const toggleSubject = (id: string) => {
    setSelectedSubjects(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleClass = (id: string) => {
    setSelectedClasses(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleLearner = (id: string) => {
    setSelectedLearners(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllLearners = () => {
    if (selectedLearners.size === learners.length) {
      setSelectedLearners(new Set());
    } else {
      setSelectedLearners(new Set(learners.map(l => l.id)));
    }
  };

  // Effective max per selected subject: per-subject override, else the default
  const effectiveMax = (subjectId: string): number | null => {
    const override = subjectMaxes[subjectId];
    if (override !== undefined && override !== '') {
      const n = Number(override);
      return isNaN(n) ? null : n;
    }
    if (defaultMax !== '') {
      const n = Number(defaultMax);
      return isNaN(n) ? null : n;
    }
    return null;
  };

  const effectiveWeight = (subjectId: string): number | null => {
    if (!weightingEnabled) return null;
    const w = subjectWeights[subjectId];
    if (w === undefined || w === '') return null; // blank means 1
    const n = Number(w);
    return isNaN(n) || n <= 0 ? null : n;
  };

  // Overall max is always derived — the sum of the subject maxes. Never typed or stored.
  const overallMax = useMemo(() => {
    let sum = 0;
    let any = false;
    for (const sid of selectedSubjects) {
      const m = effectiveMax(sid);
      if (m !== null) { sum += m; any = true; }
    }
    return any ? sum : null;
  }, [selectedSubjects, subjectMaxes, defaultMax]);

  const selectedSubjectList = subjects.filter(s => selectedSubjects.has(s.id));

  const canProceedDefine = examName.trim() && selectedTerm && selectedSubjects.size > 0;
  const canProceedAssign = assignMode === 'class' ? selectedClasses.size > 0 : selectedLearners.size > 0;
  const canCreate = canProceedDefine && canProceedAssign;

  const handleCreate = async () => {
    setCreating(true);
    setResult(null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CREATE_TIMEOUT_MS);
    try {
      const body: any = {
        name: examName.trim(),
        termId: selectedTerm,
        subjects: selectedSubjectList.map(s => ({
          subjectId: s.id,
          maxScore: effectiveMax(s.id),
          weight: effectiveWeight(s.id),
        })),
        defaultMax: defaultMax !== '' && !isNaN(Number(defaultMax)) ? Number(defaultMax) : null,
      };
      if (examDate) body.date = examDate;
      if (assignMode === 'class') {
        body.classIds = [...selectedClasses];
      } else {
        body.learnerIds = [...selectedLearners];
      }

      const res = await fetch(`${API}/assessments/exam-create/${SCHOOL_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (res.ok) {
        const d = await res.json();
        setResult({
          type: 'success',
          message: `Created ${d.created} assessment records for ${d.subjects} subject(s) (Status: Scheduled)`,
        });
        setTimeout(() => onCreated(), 1500);
      } else {
        const err = await res.json().catch(() => ({}) as any);
        setResult({ type: 'error', message: err.error || 'Failed to create exam' });
      }
    } catch (e: any) {
      setResult({
        type: 'error',
        message: e?.name === 'AbortError'
          ? `The server took longer than ${CREATE_TIMEOUT_MS / 1000}s to respond. Check the API server, then try again.`
          : e.message || 'Network error',
      });
    } finally {
      clearTimeout(timer);
      setCreating(false);
    }
  };

  return (
    <div className="page-enter">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ gap: 4 }}>
          <ArrowLeft size={15} /> Back
        </button>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>New Exam</h3>
      </div>

      {/* Step indicator */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['define', 'assign', 'confirm'] as Step[]).map((s, i) => (
          <div key={s} style={{
            display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem',
            color: step === s ? 'var(--brand-primary)' : i < ['define', 'assign', 'confirm'].indexOf(step) ? '#16a34a' : 'var(--brand-text-secondary)',
            fontWeight: step === s ? 600 : 400,
          }}>
            <div style={{
              width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: step === s ? 'var(--brand-primary)' : i < ['define', 'assign', 'confirm'].indexOf(step) ? '#16a34a' : 'var(--brand-surface)',
              color: step === s || i < ['define', 'assign', 'confirm'].indexOf(step) ? '#fff' : 'var(--brand-text-secondary)',
              fontSize: '0.7rem', fontWeight: 600,
            }}>
              {i < ['define', 'assign', 'confirm'].indexOf(step) ? <Check size={12} /> : i + 1}
            </div>
            <span>{s === 'define' ? 'Define Exam' : s === 'assign' ? 'Assign Students' : 'Confirm & Create'}</span>
          </div>
        ))}
      </div>

      {/* Step: Define */}
      {step === 'define' && (
        <div className="card" style={{ padding: 20 }}>
          <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: 16 }}>Define the Exam</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Exam name (general heading) *</label>
              <input
                type="text"
                className="input"
                placeholder="e.g. End Year Exam"
                value={examName}
                onChange={e => setExamName(e.target.value)}
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--brand-text-secondary)', marginTop: 4 }}>
                One name for the whole exam — every subject and every class you pick sits under this single heading.
              </p>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Exam date (optional)</label>
              <input
                type="date"
                className="input"
                value={examDate}
                onChange={e => setExamDate(e.target.value)}
                style={{ maxWidth: 200 }}
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--brand-text-secondary)', marginTop: 4 }}>
                Shown as the exam's time in the All Results tree.
              </p>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Term *</label>
              <select className="select" value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)}>
                <option value="">Select term...</option>
                {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>

            {/* Default max per subject */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Default max per subject</label>
              <input
                type="number"
                className="input"
                min={0}
                placeholder="e.g. 100"
                value={defaultMax}
                onChange={e => setDefaultMax(e.target.value)}
                style={{ maxWidth: 160 }}
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--brand-text-secondary)', marginTop: 4 }}>
                Applied to every subject. Any subject can override it below.
              </p>
            </div>

            {/* Subject picker */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Subjects * (pick one or more)</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {subjects.map(s => (
                  <button
                    key={s.id}
                    className={`btn btn-sm ${selectedSubjects.has(s.id) ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => toggleSubject(s.id)}
                    style={{ gap: 4, fontSize: '0.8rem' }}
                  >
                    {selectedSubjects.has(s.id) && <Check size={11} />}
                    {s.name}
                  </button>
                ))}
                {subjects.length === 0 && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--brand-text-secondary)' }}>No subjects found.</span>
                )}
              </div>
            </div>

            {/* Per-subject max (+ weight when weighting is enabled) */}
            {selectedSubjectList.length > 0 && (
              <div style={{ border: '1px solid var(--brand-border)', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                  background: 'var(--brand-surface)', fontSize: '0.75rem', fontWeight: 600,
                  color: 'var(--brand-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em',
                }}>
                  <span style={{ flex: 1 }}>Subject</span>
                  <span style={{ width: 110, textAlign: 'center' }}>Max</span>
                  {weightingEnabled && <span style={{ width: 90, textAlign: 'center' }}>Weight</span>}
                </div>
                {selectedSubjectList.map(s => (
                  <div key={s.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px',
                    borderTop: '1px solid var(--brand-border)', fontSize: '0.85rem',
                  }}>
                    <span style={{ flex: 1 }}>{s.name}</span>
                    <input
                      type="number"
                      className="input"
                      min={0}
                      placeholder={defaultMax || '—'}
                      value={subjectMaxes[s.id] ?? ''}
                      onChange={e => setSubjectMaxes(prev => ({ ...prev, [s.id]: e.target.value }))}
                      style={{ width: 110, fontSize: '0.8rem', padding: '4px 8px', textAlign: 'center' }}
                    />
                    {weightingEnabled && (
                      <input
                        type="number"
                        min={0}
                        step="any"
                        placeholder="1"
                        className="input"
                        value={subjectWeights[s.id] ?? ''}
                        onChange={e => setSubjectWeights(prev => ({ ...prev, [s.id]: e.target.value }))}
                        style={{ width: 90, fontSize: '0.8rem', padding: '4px 8px', textAlign: 'center' }}
                      />
                    )}
                  </div>
                ))}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 12px', borderTop: '1px solid var(--brand-border)',
                  background: 'var(--brand-surface)', fontSize: '0.8rem',
                }}>
                  <span style={{ color: 'var(--brand-text-secondary)', fontWeight: 500 }}>
                    Overall max (auto — sum of subject maxes)
                  </span>
                  <span style={{ fontWeight: 700 }}>{overallMax ?? '—'}</span>
                </div>
              </div>
            )}

            {/* Optional weighting — off by default, hidden when unused */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={weightingEnabled}
                onChange={e => setWeightingEnabled(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              Use subject weighting (optional)
            </label>
            {weightingEnabled && (
              <p style={{ fontSize: '0.75rem', color: 'var(--brand-text-secondary)', marginTop: -8 }}>
                Blank weight means 1. When any weight is set, the overall result becomes a weighted average of the subject percentages.
              </p>
            )}
          </div>
          <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" disabled={!canProceedDefine} onClick={() => setStep('assign')} style={{ gap: 4 }}>
              Next <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Step: Assign */}
      {step === 'assign' && (
        <div className="card" style={{ padding: 20 }}>
          <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: 16 }}>Assign Students</h4>

          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button
              className={`btn btn-sm ${assignMode === 'class' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setAssignMode('class')}
            >
              By Class
            </button>
            <button
              className={`btn btn-sm ${assignMode === 'individual' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setAssignMode('individual')}
            >
              Individual Students
            </button>
          </div>

          {assignMode === 'class' ? (
            <div>
              <p style={{ fontSize: '0.8rem', color: 'var(--brand-text-secondary)', marginBottom: 12 }}>
                Select classes — all students in each class will be included.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {classes.map(c => (
                  <button
                    key={c.id}
                    className={`btn btn-sm ${selectedClasses.has(c.id) ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => toggleClass(c.id)}
                    style={{ gap: 4 }}
                  >
                    {selectedClasses.has(c.id) && <Check size={12} />}
                    {c.name}
                  </button>
                ))}
              </div>
              {selectedClasses.size > 0 && (
                <p style={{ fontSize: '0.8rem', color: 'var(--brand-text-secondary)', marginTop: 12 }}>
                  {learners.length} student{learners.length !== 1 ? 's' : ''} × {selectedSubjects.size} subject{selectedSubjects.size !== 1 ? 's' : ''} = {learners.length * selectedSubjects.size} assessment record{learners.length * selectedSubjects.size !== 1 ? 's' : ''}
                  {loadingLearners && ' (loading...)'}
                </p>
              )}
            </div>
          ) : (
            <div>
              <p style={{ fontSize: '0.8rem', color: 'var(--brand-text-secondary)', marginBottom: 12 }}>
                Pick individual students.
              </p>
              <button className="btn btn-ghost btn-sm" onClick={selectAllLearners} style={{ marginBottom: 8 }}>
                {selectedLearners.size === learners.length ? 'Deselect all' : 'Select all'}
              </button>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 200, overflow: 'auto' }}>
                {learners.map(l => (
                  <button
                    key={l.id}
                    className={`btn btn-sm ${selectedLearners.has(l.id) ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => toggleLearner(l.id)}
                    style={{ gap: 4, fontSize: '0.75rem' }}
                  >
                    {selectedLearners.has(l.id) && <Check size={10} />}
                    {l.name}
                  </button>
                ))}
              </div>
              {selectedLearners.size > 0 && (
                <p style={{ fontSize: '0.8rem', color: 'var(--brand-text-secondary)', marginTop: 8 }}>
                  {selectedLearners.size} student{selectedLearners.size !== 1 ? 's' : ''} × {selectedSubjects.size} subject{selectedSubjects.size !== 1 ? 's' : ''} selected
                </p>
              )}
            </div>
          )}

          <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setStep('define')} style={{ gap: 4 }}>
              <ArrowLeft size={14} /> Back
            </button>
            <button className="btn btn-primary" disabled={!canProceedAssign} onClick={() => setStep('confirm')} style={{ gap: 4 }}>
              Next <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Step: Confirm */}
      {step === 'confirm' && (
        <div className="card" style={{ padding: 20 }}>
          <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: 16 }}>Confirm & Create</h4>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 480, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--brand-text-secondary)' }}>Exam:</span>
              <span style={{ fontWeight: 500 }}>{examName}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--brand-text-secondary)' }}>Term:</span>
              <span style={{ fontWeight: 500 }}>{terms.find(t => t.id === selectedTerm)?.name}</span>
            </div>
            {examDate && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--brand-text-secondary)' }}>Date:</span>
                <span style={{ fontWeight: 500 }}>
                  {new Date(examDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--brand-text-secondary)' }}>Students:</span>
              <span style={{ fontWeight: 500 }}>
                {assignMode === 'class'
                  ? `${learners.length} students across ${selectedClasses.size} class(es)`
                  : `${selectedLearners.size} student(s)`}
              </span>
            </div>
          </div>

          {/* Subjects with maxes (and weights when enabled) */}
          <div style={{ border: '1px solid var(--brand-border)', borderRadius: 8, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px',
              background: 'var(--brand-surface)', fontSize: '0.72rem', fontWeight: 600,
              color: 'var(--brand-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em',
            }}>
              <span style={{ flex: 1 }}>Subject</span>
              <span style={{ width: 90, textAlign: 'right' }}>Max</span>
              {weightingEnabled && <span style={{ width: 70, textAlign: 'right' }}>Weight</span>}
            </div>
            {selectedSubjectList.map(s => (
              <div key={s.id} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
                borderTop: '1px solid var(--brand-border)', fontSize: '0.82rem',
              }}>
                <span style={{ flex: 1 }}>{s.name}</span>
                <span style={{ width: 90, textAlign: 'right', fontWeight: 500 }}>{effectiveMax(s.id) ?? '—'}</span>
                {weightingEnabled && (
                  <span style={{ width: 70, textAlign: 'right', fontWeight: 500 }}>{effectiveWeight(s.id) ?? 1}</span>
                )}
              </div>
            ))}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '7px 12px', borderTop: '1px solid var(--brand-border)',
              background: 'var(--brand-surface)', fontSize: '0.82rem',
            }}>
              <span style={{ color: 'var(--brand-text-secondary)', fontWeight: 500 }}>Overall max (auto)</span>
              <span style={{ fontWeight: 700 }}>{overallMax ?? '—'}</span>
            </div>
          </div>

          <p style={{ fontSize: '0.8rem', color: 'var(--brand-text-secondary)', marginBottom: 16 }}>
            This will create one assessment record per student per subject with Status = "Scheduled".
            Max scores and weights are stored on the records and stay editable.
          </p>

          {result && (
            <div style={{
              padding: '10px 14px', borderRadius: 6, fontSize: '0.85rem', marginBottom: 16,
              display: 'flex', alignItems: 'center', gap: 8,
              background: result.type === 'success' ? '#f0fdf4' : '#fef2f2',
              color: result.type === 'success' ? '#166534' : '#991b1b',
            }}>
              {result.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              {result.message}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setStep('assign')} disabled={creating} style={{ gap: 4 }}>
              <ArrowLeft size={14} /> Back
            </button>
            <button className="btn btn-primary" onClick={handleCreate} disabled={creating || !canCreate} style={{ gap: 4 }}>
              {creating ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
              {creating ? 'Creating...' : 'Create Exam'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
