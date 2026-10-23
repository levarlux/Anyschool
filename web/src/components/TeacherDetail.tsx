// Teacher Detail — Relationship-Panel-First Layout (Doc 17)
// Leads with subjects & classes panels, then personal info sections.
// Link/unlink subjects and classes directly from the detail view.

import { useState, useEffect } from 'react';
import {
  ArrowLeft, Edit3, Trash2,
  BookOpen, School, Save, X, UserPlus, UserMinus,
} from 'lucide-react';
import ASSpinner from './ASSpinner';
import Avatar from './Avatar';
import { LearnerDetailSkeleton } from './Skeleton';
import DynamicField from './DynamicField';
import { useConfirm } from './ConfirmProvider';
import { loadCache, saveCache, fetchVersions } from '../lib/cache';
import FieldValueDisplay from './FieldValueDisplay';

const API = '/api';
const SCHOOL_ID = localStorage.getItem('anyschool_current_school') || '88374870-9175-4565-a876-f17c2e295519';

interface DetailData {
  id: string;
  values: Record<string, any>;
  sections: Array<{
    id: string;
    name: string;
    fields: Array<any>;
  }>;
  unsectionedFields: Array<any>;
  related: Record<string, any[]>;
  relationshipDefIds: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

interface RelatedEntry {
  id: string;
  values: Record<string, any>;
  linkId: string;
}

interface Props {
  recordId: string;
  initialData: { id: string; values: Record<string, any> } | null;
  onBack: () => void;
  onDeleted: () => void;
  onSaved?: () => void;
}

export default function TeacherDetail({ recordId, initialData, onBack, onDeleted, onSaved }: Props) {
  const { confirm } = useConfirm();
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteInfo, setDeleteInfo] = useState<any>(null);

  // Relationship state — Subjects
  const [subjects, setSubjects] = useState<RelatedEntry[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(true);
  const [subjectsRelDefId, setSubjectsRelDefId] = useState<string | null>(null);
  const [addingSubject, setAddingSubject] = useState(false);
  const [availableSubjects, setAvailableSubjects] = useState<any[]>([]);

  // Relationship state — Classes
  const [classes, setClasses] = useState<RelatedEntry[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [classesRelDefId, setClassesRelDefId] = useState<string | null>(null);
  const [addingClass, setAddingClass] = useState(false);
  const [availableClasses, setAvailableClasses] = useState<any[]>([]);

  const CACHE_KEY = `anyschool_record_${SCHOOL_ID}_${recordId}`;

  // ─── Load Record ──────────────────────────────────────────
  useEffect(() => {
    let hadCache = false;

    const cached = loadCache<any>(CACHE_KEY);
    if (cached) {
      setData(cached.data);
      setEditValues(cached.data.values || {});
      hadCache = true;
      setLoading(false);
    }

    if (!hadCache && initialData) {
      setData({ ...initialData, sections: [], unsectionedFields: [], related: {}, relationshipDefIds: {}, createdAt: '', updatedAt: '' } as any);
      setEditValues(initialData.values || {});
      hadCache = true;
      setLoading(false);
    }

    fetch(`${API}/teachers/record/${SCHOOL_ID}/${recordId}`).then(r => r.json()).then(async d => {
      setData(d);
      setEditValues(d.values || {});
      const versions = await fetchVersions(SCHOOL_ID);
      saveCache(CACHE_KEY, d, versions || {});
      setLoading(false);
      // Load relationships after data is available
      loadSubjects(d);
      loadClasses(d);
    }).catch(() => {
      if (!hadCache) setLoading(false);
    });
  }, [recordId]);

  const refreshData = async () => {
    try {
      const res = await fetch(`${API}/teachers/record/${SCHOOL_ID}/${recordId}`);
      if (res.ok) {
        const d = await res.json();
        setData(d);
        setEditValues(d.values || {});
        const versions = await fetchVersions(SCHOOL_ID);
        saveCache(CACHE_KEY, d, versions || {});
        loadSubjects(d);
        loadClasses(d);
      }
    } catch {}
  };

  // ─── Load Subjects ────────────────────────────────────────
  const loadSubjects = async (detailData?: DetailData) => {
    setSubjectsLoading(true);
    const d = detailData || data;
    if (!d) { setSubjectsLoading(false); return; }
    try {
      const res = await fetch(`${API}/teachers/related/${SCHOOL_ID}/${recordId}/subject`);
      if (res.ok) {
        const result = await res.json();
        setSubjects(result.records || []);
        setSubjectsRelDefId(result.relationshipDefinitionId || d.relationshipDefIds?.subjects || null);
      }
    } catch {}
    setSubjectsLoading(false);
  };

  // ─── Load Classes ─────────────────────────────────────────
  const loadClasses = async (detailData?: DetailData) => {
    setClassesLoading(true);
    const d = detailData || data;
    if (!d) { setClassesLoading(false); return; }
    try {
      const res = await fetch(`${API}/teachers/related/${SCHOOL_ID}/${recordId}/class`);
      if (res.ok) {
        const result = await res.json();
        setClasses(result.records || []);
        setClassesRelDefId(result.relationshipDefinitionId || d.relationshipDefIds?.class || null);
      }
    } catch {}
    setClassesLoading(false);
  };

  // ─── Subject Link/Unlink ──────────────────────────────────
  const loadAvailableSubjects = async () => {
    try {
      const res = await fetch(`${API}/teachers/available/${SCHOOL_ID}/${recordId}/subject`);
      if (res.ok) {
        const d = await res.json();
        setAvailableSubjects(d.records || []);
      }
    } catch {}
  };

  const handleLinkSubject = async (subjectId: string) => {
    if (!subjectsRelDefId) return;
    try {
      const res = await fetch(`${API}/teachers/link/${SCHOOL_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromRecordId: recordId,
          toRecordId: subjectId,
          relationshipDefinitionId: subjectsRelDefId,
        }),
      });
      if (res.ok) {
        setAddingSubject(false);
        loadSubjects();
        refreshData();
      }
    } catch {}
  };

  const handleUnlinkSubject = async (linkId: string) => {
    const typed = await confirm({
      title: 'Remove Subject',
      message: 'Remove this subject from the teacher\'s assignments?',
      confirmText: 'Remove',
      variant: 'warning',
    });
    if (!typed) return;
    try {
      const res = await fetch(`${API}/teachers/unlink/${SCHOOL_ID}/${linkId}`, { method: 'DELETE' });
      if (res.ok) {
        loadSubjects();
        refreshData();
      }
    } catch {}
  };

  // ─── Class Link/Unlink ────────────────────────────────────
  const loadAvailableClasses = async () => {
    try {
      const res = await fetch(`${API}/teachers/available/${SCHOOL_ID}/${recordId}/class`);
      if (res.ok) {
        const d = await res.json();
        setAvailableClasses(d.records || []);
      }
    } catch {}
  };

  const handleLinkClass = async (classId: string) => {
    if (!classesRelDefId) return;
    try {
      const res = await fetch(`${API}/teachers/link/${SCHOOL_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromRecordId: recordId,
          toRecordId: classId,
          relationshipDefinitionId: classesRelDefId,
        }),
      });
      if (res.ok) {
        setAddingClass(false);
        loadClasses();
        refreshData();
      }
    } catch {}
  };

  const handleUnlinkClass = async (linkId: string) => {
    const typed = await confirm({
      title: 'Remove Class',
      message: 'Remove this class from the teacher\'s assignments?',
      confirmText: 'Remove',
      variant: 'warning',
    });
    if (!typed) return;
    try {
      const res = await fetch(`${API}/teachers/unlink/${SCHOOL_ID}/${linkId}`, { method: 'DELETE' });
      if (res.ok) {
        loadClasses();
        refreshData();
      }
    } catch {}
  };

  // ─── Identity ─────────────────────────────────────────────
  const getIdentity = () => {
    if (!data) return { name: 'Teacher', photo: null, initials: '??' };
    const vals = data.values;
    const firstName = vals['first_name'] || '';
    const lastName = vals['last_name'] || '';
    const name = vals['full_name'] || vals['name'] ||
      [firstName, lastName].filter(Boolean).join(' ') || 'Teacher';
    const photo = vals['photo'] || vals['passport_photo'] || vals['avatar'] || null;
    const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
    return { name, photo, initials };
  };

  const getQuickStats = () => {
    if (!data) return [];
    const vals = data.values;
    const stats: Array<{ label: string; value: string; color: string }> = [];
    if (vals['status']) stats.push({ label: 'Status', value: vals['status'], color: vals['status'] === 'Active' ? '#22c55e' : vals['status'] === 'Resigned' ? '#ef4444' : '#f59e0b' });
    if (vals['department']) stats.push({ label: 'Dept', value: vals['department'], color: '#8b5cf6' });
    if (vals['qualification']) stats.push({ label: 'Qualification', value: vals['qualification'], color: '#3b82f6' });
    if (vals['employee_id']) stats.push({ label: 'Emp ID', value: vals['employee_id'], color: '#6b7280' });
    if (vals['salary']) stats.push({ label: 'Salary', value: `KES ${Number(vals['salary']).toLocaleString()}`, color: '#06b6d4' });
    stats.push({ label: 'Subjects', value: String(subjects.length), color: '#a855f7' });
    stats.push({ label: 'Classes', value: String(classes.length), color: '#22c55e' });
    return stats.slice(0, 6);
  };

  // ─── Save / Delete ────────────────────────────────────────
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus('idle');
    try {
      const res = await fetch(`${API}/teachers/update/${SCHOOL_ID}/${recordId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: editValues }),
      });
      if (res.ok) {
        localStorage.removeItem(CACHE_KEY);
        await refreshData();
        setEditing(false);
        setSaveStatus('success');
        onSaved?.();
        setTimeout(() => setSaveStatus('idle'), 2500);
      } else {
        const err = await res.json().catch(() => ({}));
        console.error('Save failed:', err.error || res.statusText);
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('idle'), 3000);
      }
    } catch (e) {
      console.error('Save failed:', e);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
    setSaving(false);
  };

  const handlePhotoUpload = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setEditValues(prev => ({ ...prev, photo: dataUrl }));
      const res = await fetch(`${API}/teachers/update/${SCHOOL_ID}/${recordId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: { photo: dataUrl }, partial: true }),
      });
      if (res.ok) {
        localStorage.removeItem(CACHE_KEY);
        await refreshData();
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setDeleting(true);
      try {
        const res = await fetch(`${API}/teachers/delete/${SCHOOL_ID}/${recordId}`, { method: 'DELETE' });
        if (res.ok) {
          const d = await res.json();
          setDeleteInfo(d);
          setConfirmDelete(true);
        }
      } catch {}
      setDeleting(false);
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`${API}/teachers/delete/${SCHOOL_ID}/${recordId}`, { method: 'DELETE' });
      if (res.ok) onDeleted();
    } catch {}
    setDeleting(false);
  };

  const handlePermanentDelete = async () => {
    const teacherName = data?.values?.full_name || data?.values?.first_name || 'this teacher';
    const typed = await confirm({
      title: 'Permanently Delete Teacher',
      message: `This will PERMANENTLY delete ${teacherName} and all related records (subjects, classes, etc). This cannot be undone.`,
      confirmText: 'Permanently Delete',
      variant: 'destructive',
      requireTypedConfirm: true,
      typedConfirmText: teacherName,
    });
    if (!typed) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API}/teachers/permanent-delete/${SCHOOL_ID}/${recordId}`, { method: 'DELETE' });
      if (res.ok) onDeleted();
    } catch {}
    setDeleting(false);
  };

  // ─── Loading / Empty States ───────────────────────────────
  if (loading) {
    return (
      <div className="page-enter">
        <button className="btn btn-ghost" onClick={onBack} style={{ marginBottom: 16, gap: 6 }}>
          <ArrowLeft size={15} /> Back to Teachers
        </button>
        <LearnerDetailSkeleton />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page-enter">
        <button className="btn btn-ghost" onClick={onBack} style={{ marginBottom: 16, gap: 6 }}>
          <ArrowLeft size={15} /> Back to Teachers
        </button>
        <div className="empty-state"><p>Teacher not found.</p></div>
      </div>
    );
  }

  const identity = getIdentity();
  const quickStats = getQuickStats();
  const sections = data.sections || [];
  const unsectionedFields = data.unsectionedFields || [];

  return (
    <div className="page-enter">
      {/* Back + Actions */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button className="btn btn-ghost" onClick={onBack} style={{ gap: 6 }}>
          <ArrowLeft size={15} /> Back to Teachers
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          {editing ? (
            <>
              <button className="btn btn-secondary" onClick={() => { setEditing(false); setEditValues(data.values || {}); }}><X size={14} /> Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving}
                style={saveStatus === 'success' ? { background: '#22c55e', borderColor: '#22c55e' } : saveStatus === 'error' ? { background: '#ef4444', borderColor: '#ef4444' } : {}}
              >
                {saving ? <ASSpinner size="sm" /> : saveStatus === 'success' ? '\u2713' : saveStatus === 'error' ? '\u2717' : <Save size={14} />}
                {saving ? 'Saving...' : saveStatus === 'success' ? 'Saved!' : saveStatus === 'error' ? 'Failed' : 'Save Changes'}
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={() => setEditing(true)}><Edit3 size={14} /> Edit</button>
              <button className="btn btn-secondary" onClick={handleDelete} disabled={deleting} style={{ color: '#dc2626' }}>
                <Trash2 size={14} /> {confirmDelete ? 'Confirm Delete' : 'Delete'}
              </button>
              {confirmDelete && (
                <button className="btn" onClick={handlePermanentDelete} disabled={deleting}
                  style={{ background: '#dc2626', color: 'white' }}>
                  {deleting ? <ASSpinner size="sm" /> : <Trash2 size={14} />}
                  Permanently Delete
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Delete warning banner */}
      {confirmDelete && deleteInfo && (
        <div className="card" style={{ padding: 12, marginBottom: 16, background: '#fef2f2', border: '1px solid #fecaca' }}>
          <p style={{ fontSize: '0.85rem', color: '#991b1b' }}>
            This will archive the teacher record.
            {deleteInfo.affected?.relationships > 0 && (
              <> <strong>{deleteInfo.affected.relationships}</strong> linked relationship(s) will also be hidden.</>
            )}
          </p>
        </div>
      )}

      {/* ─── Hero Profile Card ────────────────────────────── */}
      <div style={{
        background: `linear-gradient(135deg, color-mix(in srgb, var(--brand-primary) 30%, #1a1a2e) 0%, color-mix(in srgb, var(--brand-primary) 20%, #1a1a2e) 50%, color-mix(in srgb, var(--brand-primary) 15%, #1a1a2e) 100%)`,
        borderRadius: 16, padding: '32px 32px 24px', marginBottom: 20,
        position: 'relative', overflow: 'hidden', opacity: 0.95,
      }}>
        {/* Pattern overlay */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.05,
          backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }} />

        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
          {/* Avatar */}
          <Avatar
            photo={identity.photo}
            name={identity.name}
            size={96}
            borderRadius={16}
            editable
            onUpload={handlePhotoUpload}
            style={{ border: '3px solid rgba(255,255,255,0.3)' }}
          />

          {/* Name + info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'white', margin: '0 0 4px' }}>
              {identity.name}
            </h1>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              {data.values['employee_id'] && (
                <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace' }}>
                  #{data.values['employee_id']}
                </span>
              )}
              {data.values['status'] && (
                <span style={{
                  fontSize: '0.75rem', fontWeight: 600, padding: '2px 10px', borderRadius: 12,
                  background: data.values['status'] === 'Active' ? 'rgba(34,197,94,0.2)' : data.values['status'] === 'Resigned' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)',
                  color: data.values['status'] === 'Active' ? '#86efac' : data.values['status'] === 'Resigned' ? '#fca5a5' : '#fcd34d',
                }}>
                  {data.values['status']}
                </span>
              )}
              {data.values['department'] && (
                <span style={{
                  fontSize: '0.75rem', fontWeight: 500, padding: '2px 10px', borderRadius: 12,
                  background: 'rgba(139,92,246,0.2)', color: '#c4b5fd',
                }}>
                  {data.values['department']}
                </span>
              )}
            </div>
          </div>

          {/* Quick stats */}
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 300 }}>
            {quickStats.map((stat, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: '4px 10px',
                fontSize: '0.8rem',
              }}>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>{stat.label}</span>
                <span style={{ fontWeight: 600 }}>{stat.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
          UNIFIED ASSIGNMENT SUMMARY — Below profile card
         ═══════════════════════════════════════════════════════ */}
      {(subjects.length > 0 || classes.length > 0) && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--brand-primary-light, #eff6ff)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BookOpen size={16} style={{ color: 'var(--brand-primary, #3b82f6)' }} />
            </div>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, margin: 0 }}>Assignment Summary</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {subjects.map((subject) => {
              const subjectName = subject.values?.subject_name || subject.values?.name || Object.values(subject.values || {}).slice(0, 1)[0] || 'Subject';
              const matchingClasses = classes.filter(cl => {
                const gradeLevel = cl.values?.grade_level || cl.values?.grade;
                return gradeLevel != null;
              });
              if (matchingClasses.length > 0) {
                return matchingClasses.map((cl) => {
                  const className = cl.values?.class_name || cl.values?.name || 'Class';
                  const gradeLevel = cl.values?.grade_level || cl.values?.grade || '';
                  return (
                    <div key={`${subject.id}-${cl.id}`} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                      background: '#f9fafb', borderRadius: 8, fontSize: '0.85rem',
                    }}>
                      <BookOpen size={13} style={{ color: '#a855f7', flexShrink: 0 }} />
                      <span style={{ fontWeight: 500 }}>{subjectName}</span>
                      <span style={{ color: '#9ca3af' }}>→</span>
                      <School size={13} style={{ color: '#22c55e', flexShrink: 0 }} />
                      <span>{className}</span>
                      {gradeLevel && <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>(Grade {gradeLevel})</span>}
                    </div>
                  );
                });
              }
              return (
                <div key={subject.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                  background: '#f9fafb', borderRadius: 8, fontSize: '0.85rem',
                }}>
                  <BookOpen size={13} style={{ color: '#a855f7', flexShrink: 0 }} />
                  <span style={{ fontWeight: 500 }}>{subjectName}</span>
                  <span style={{ color: '#9ca3af', fontSize: '0.75rem', marginLeft: 'auto' }}>No class assigned</span>
                </div>
              );
            })}
            {classes.filter(cl => {
              // Show classes that aren't already shown in the subject→class mapping above
              const hasMatchingSubject = subjects.some(() => {
                const gradeLevel = cl.values?.grade_level || cl.values?.grade;
                return gradeLevel != null;
              });
              return !hasMatchingSubject;
            }).map((cl) => {
              const className = cl.values?.class_name || cl.values?.name || 'Class';
              const gradeLevel = cl.values?.grade_level || cl.values?.grade || '';
              return (
                <div key={cl.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                  background: '#f9fafb', borderRadius: 8, fontSize: '0.85rem',
                }}>
                  <School size={13} style={{ color: '#22c55e', flexShrink: 0 }} />
                  <span style={{ fontWeight: 500 }}>{className}</span>
                  {gradeLevel && <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>(Grade {gradeLevel})</span>}
                  <span style={{ color: '#9ca3af', fontSize: '0.75rem', marginLeft: 'auto' }}>No subject assigned</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          RELATIONSHIP PANELS — SUBJECTS (lead with relationships)
         ═══════════════════════════════════════════════════════ */}

      {/* ─── Subjects Panel ───────────────────────────────── */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BookOpen size={18} style={{ color: '#a855f7' }} />
            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Assigned Subjects</h3>
            <span className="badge" style={{ background: '#faf5ff', color: '#7c3aed' }}>
              {subjects.length} subject{subjects.length !== 1 ? 's' : ''}
            </span>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => { loadAvailableSubjects(); setAddingSubject(true); }}>
            <UserPlus size={14} /> Assign Subject
          </button>
        </div>

        {subjectsLoading ? (
          <div style={{ padding: 20, textAlign: 'center' }}><ASSpinner size="sm" /></div>
        ) : subjects.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--brand-text-tertiary)' }}>
            <BookOpen size={32} style={{ marginBottom: 8, opacity: 0.3 }} />
            <p style={{ fontSize: '0.85rem' }}>No subjects assigned yet.</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Subject Name</th>
                  <th>Code</th>
                  <th>Category</th>
                  <th>Weekly Hours</th>
                  <th style={{ width: 48 }}></th>
                </tr>
              </thead>
              <tbody>
                {subjects.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <div className="td-primary">
                        {entry.values?.subject_name || entry.values?.name || Object.values(entry.values || {}).slice(0, 1)[0] || 'Subject'}
                      </div>
                    </td>
                    <td><span className="td-mono">{entry.values?.subject_code || entry.values?.code || '—'}</span></td>
                    <td>
                      <span className="badge" style={{
                        background: entry.values?.category === 'Core' ? '#dbeafe' : '#f3f4f6',
                        color: entry.values?.category === 'Core' ? '#2563eb' : '#6b7280',
                      }}>
                        {entry.values?.category || '—'}
                      </span>
                    </td>
                    <td>{entry.values?.weekly_hours ?? entry.values?.hours ?? '—'}h</td>
                    <td>
                      <button className="btn btn-ghost btn-icon" style={{ width: 28, height: 28 }}
                        onClick={(e) => { e.stopPropagation(); handleUnlinkSubject(entry.linkId); }}
                        title="Remove subject">
                        <UserMinus size={13} style={{ color: '#dc2626' }} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Subject Panel */}
      {addingSubject && (
        <div className="card" style={{ padding: 16, marginBottom: 16, border: '1px solid #a855f7' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 600 }}>Assign Subject to Teacher</h4>
            <button className="btn btn-ghost btn-icon" onClick={() => setAddingSubject(false)} style={{ width: 28, height: 28 }}><X size={14} /></button>
          </div>
          {availableSubjects.length === 0 ? (
            <p style={{ fontSize: '0.8rem', color: 'var(--brand-text-tertiary)' }}>All subjects are already assigned to this teacher.</p>
          ) : (
            <div style={{ maxHeight: 200, overflow: 'auto' }}>
              {availableSubjects.slice(0, 20).map((s: any) => (
                <div key={s.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 8px', borderBottom: '1px solid #f3f4f6',
                }}>
                  <span style={{ fontSize: '0.85rem' }}>
                    {s.values?.subject_name || s.values?.name || Object.values(s.values || {}).slice(0, 1)[0] || s.id.slice(0, 8)}
                    {s.values?.subject_code && <span style={{ color: '#9ca3af', marginLeft: 8 }}>({s.values.subject_code})</span>}
                  </span>
                  <button className="btn btn-ghost" style={{ fontSize: '0.75rem', color: '#a855f7' }}
                    onClick={() => handleLinkSubject(s.id)}>
                    <UserPlus size={12} /> Assign
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Classes Panel ────────────────────────────────── */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <School size={18} style={{ color: 'var(--brand-primary, #3b82f6)' }} />
            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Assigned Classes</h3>
            <span className="badge" style={{ background: 'var(--brand-primary-light, #eff6ff)', color: 'var(--brand-primary, #3b82f6)' }}>
              {classes.length} class{classes.length !== 1 ? 'es' : ''}
            </span>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => { loadAvailableClasses(); setAddingClass(true); }}>
            <UserPlus size={14} /> Assign Class
          </button>
        </div>

        {classesLoading ? (
          <div style={{ padding: 20, textAlign: 'center' }}><ASSpinner size="sm" /></div>
        ) : classes.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--brand-text-tertiary)' }}>
            <School size={32} style={{ marginBottom: 8, opacity: 0.3 }} />
            <p style={{ fontSize: '0.85rem' }}>No classes assigned yet.</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Class Name</th>
                  <th>Grade Level</th>
                  <th>Room</th>
                  <th>Capacity</th>
                  <th style={{ width: 48 }}></th>
                </tr>
              </thead>
              <tbody>
                {classes.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <div className="td-primary">
                        {entry.values?.class_name || entry.values?.name || Object.values(entry.values || {}).slice(0, 1)[0] || 'Class'}
                      </div>
                    </td>
                    <td>{entry.values?.grade_level ?? entry.values?.grade ?? '—'}</td>
                    <td><span className="td-mono">{entry.values?.room_number || entry.values?.room || '—'}</span></td>
                    <td>{entry.values?.capacity ?? '—'}</td>
                    <td>
                      <button className="btn btn-ghost btn-icon" style={{ width: 28, height: 28 }}
                        onClick={(e) => { e.stopPropagation(); handleUnlinkClass(entry.linkId); }}
                        title="Remove class">
                        <UserMinus size={13} style={{ color: '#dc2626' }} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Class Panel */}
      {addingClass && (
        <div className="card" style={{ padding: 16, marginBottom: 16, border: '1px solid var(--brand-primary, #3b82f6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 600 }}>Assign Class to Teacher</h4>
            <button className="btn btn-ghost btn-icon" onClick={() => setAddingClass(false)} style={{ width: 28, height: 28 }}><X size={14} /></button>
          </div>
          {availableClasses.length === 0 ? (
            <p style={{ fontSize: '0.8rem', color: 'var(--brand-text-tertiary)' }}>All classes are already assigned to this teacher.</p>
          ) : (
            <div style={{ maxHeight: 200, overflow: 'auto' }}>
              {availableClasses.slice(0, 20).map((cl: any) => (
                <div key={cl.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 8px', borderBottom: '1px solid #f3f4f6',
                }}>
                  <span style={{ fontSize: '0.85rem' }}>
                    {cl.values?.class_name || cl.values?.name || Object.values(cl.values || {}).slice(0, 1)[0] || cl.id.slice(0, 8)}
                    {cl.values?.grade_level && <span style={{ color: '#9ca3af', marginLeft: 8 }}>(Grade {cl.values.grade_level})</span>}
                  </span>
                  <button className="btn btn-ghost" style={{ fontSize: '0.75rem', color: 'var(--brand-primary, #3b82f6)' }}
                    onClick={() => handleLinkClass(cl.id)}>
                    <UserPlus size={12} /> Assign
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          FIELD SECTIONS — Personal Info, Qualifications, etc.
         ═══════════════════════════════════════════════════════ */}

      {editing ? (
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 16 }}>Edit Teacher Details</h3>
          {sections.map((section) => (
            section.fields.length > 0 && (
              <div key={section.id} style={{ marginBottom: 20 }}>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #f3f4f6' }}>
                  {section.name}
                </h4>
                <div className="form-grid">
                  {section.fields.map((field: any) => (
                    <DynamicField
                      key={field.id}
                      field={field}
                      value={editValues[field.internalName]}
                      onChange={(val) => setEditValues(prev => ({ ...prev, [field.internalName]: val }))}
                    />
                  ))}
                </div>
              </div>
            )
          ))}
          {unsectionedFields.length > 0 && (
            <div>
              <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #f3f4f6' }}>
                Additional Information
              </h4>
              <div className="form-grid">
                {unsectionedFields.map((field: any) => (
                  <DynamicField
                    key={field.id}
                    field={field}
                    value={editValues[field.internalName]}
                    onChange={(val) => setEditValues(prev => ({ ...prev, [field.internalName]: val }))}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {sections.map((section) => (
            section.fields.length > 0 && (
              <div key={section.id} className="card" style={{ padding: 20, marginBottom: 16 }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: 16, color: '#374151' }}>
                  {section.name}
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                  {section.fields.map((field: any) => (
                    <div key={field.id}>
                      <label style={{ fontSize: '0.75rem', color: 'var(--brand-text-tertiary)', marginBottom: 4, display: 'block' }}>
                        {field.name}
                      </label>
                    <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                      {field.internalName?.includes('status') ? (
                        <span className={`badge ${field.value === 'Active' ? 'badge-success' : field.value === 'Resigned' ? 'badge-error' : 'badge-warning'}`}>{field.value}</span>
                      ) : (
                        <FieldValueDisplay
                          field={field}
                          value={field.value}
                          displayName={getIdentity().name}
                          imageSize={40}
                        />
                      )}
                    </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          ))}

          {unsectionedFields.length > 0 && (
            <div className="card" style={{ padding: 20, marginBottom: 16 }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: 16, color: '#374151' }}>
                Additional Information
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                {unsectionedFields.map((field: any) => (
                  <div key={field.id}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--brand-text-tertiary)', marginBottom: 4, display: 'block' }}>
                      {field.name}
                    </label>
                    <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                      <FieldValueDisplay
                        field={field}
                        value={field.value}
                        displayName={getIdentity().name}
                        imageSize={40}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── Metadata Footer ──────────────────────────────── */}
      <div style={{
        padding: '12px 20px', borderRadius: 10, background: '#f9fafb',
        display: 'flex', gap: 24, fontSize: '0.75rem', color: '#9ca3af', flexWrap: 'wrap',
      }}>
        <span>Created: {new Date(data.createdAt).toLocaleDateString()}</span>
        <span>Updated: {new Date(data.updatedAt).toLocaleDateString()}</span>
        <span style={{ fontFamily: 'monospace' }}>ID: {data.id.slice(0, 8)}...</span>
      </div>
    </div>
  );
}
