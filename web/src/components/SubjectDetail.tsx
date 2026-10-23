// Subject Detail — Relationship-Panel-First Layout (Doc 18)
// Leads with teacher, learner, and class panels, then subject fields.
// Link/unlink teachers, learners, and classes directly from the detail view.

import { useState, useEffect } from 'react';
import {
  ArrowLeft, Edit3, Trash2,
  GraduationCap, Users, School, Save, X,
} from 'lucide-react';
import ASSpinner from './ASSpinner';
import Avatar from './Avatar';
import RelationshipInlinePanel from './RelationshipInlinePanel';
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

export default function SubjectDetail({ recordId, initialData, onBack, onDeleted, onSaved }: Props) {
  const { confirm } = useConfirm();
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Relationship state — Teachers
  const [teachers, setTeachers] = useState<RelatedEntry[]>([]);
  const [teachersLoading, setTeachersLoading] = useState(true);
  const [teachersRelDefId, setTeachersRelDefId] = useState<string | null>(null);
  const [availableTeachers, setAvailableTeachers] = useState<any[]>([]);

  // Relationship state — Learners
  const [learners, setLearners] = useState<RelatedEntry[]>([]);
  const [learnersLoading, setLearnersLoading] = useState(true);
  const [learnersRelDefId, setLearnersRelDefId] = useState<string | null>(null);
  const [availableLearners, setAvailableLearners] = useState<any[]>([]);

  // Relationship state — Classes
  const [classes, setClasses] = useState<RelatedEntry[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [classesRelDefId, setClassesRelDefId] = useState<string | null>(null);
  const [availableClasses, setAvailableClasses] = useState<any[]>([]);

  // Bulk linking state — "Add Entire Class" for learners
  const [classLearners, setClassLearners] = useState<any[]>([]);
  const [, setSelectedClassId] = useState<string | null>(null);
  const [, setLoadingClassLearners] = useState(false);
  const [classesForBulkLink, setClassesForBulkLink] = useState<any[]>([]);

  const CACHE_KEY = `anyschool_record_${SCHOOL_ID}_${recordId}`;

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

    fetch(`${API}/subjects/record/${SCHOOL_ID}/${recordId}`).then(r => r.json()).then(async d => {
      setData(d);
      setEditValues(d.values || {});
      const versions = await fetchVersions(SCHOOL_ID);
      saveCache(CACHE_KEY, d, versions || {});
      setLoading(false);
      loadTeachers(d);
      loadLearners(d);
      loadClasses(d);
    }).catch(() => {
      if (!hadCache) setLoading(false);
    });
  }, [recordId]);

  const refreshData = async () => {
    try {
      const res = await fetch(`${API}/subjects/record/${SCHOOL_ID}/${recordId}`);
      if (res.ok) {
        const d = await res.json();
        setData(d);
        setEditValues(d.values || {});
        const versions = await fetchVersions(SCHOOL_ID);
        saveCache(CACHE_KEY, d, versions || {});
        loadTeachers(d);
        loadLearners(d);
        loadClasses(d);
      }
    } catch {}
  };

  // ─── Load Teachers ───
  const loadTeachers = async (detailData?: DetailData) => {
    setTeachersLoading(true);
    const d = detailData || data;
    if (!d) { setTeachersLoading(false); return; }
    try {
      const res = await fetch(`${API}/subjects/related/${SCHOOL_ID}/${recordId}/teacher`);
      if (res.ok) {
        const result = await res.json();
        setTeachers(result.records || []);
        setTeachersRelDefId(result.relationshipDefinitionId || d.relationshipDefIds?.teacher || null);
      }
    } catch {}
    setTeachersLoading(false);
  };

  // ─── Load Learners ───
  const loadLearners = async (detailData?: DetailData) => {
    setLearnersLoading(true);
    const d = detailData || data;
    if (!d) { setLearnersLoading(false); return; }
    try {
      const res = await fetch(`${API}/subjects/related/${SCHOOL_ID}/${recordId}/learner`);
      if (res.ok) {
        const result = await res.json();
        setLearners(result.records || []);
        setLearnersRelDefId(result.relationshipDefinitionId || d.relationshipDefIds?.learner || null);
      }
    } catch {}
    setLearnersLoading(false);
  };

  // ─── Load Classes ───
  const loadClasses = async (detailData?: DetailData) => {
    setClassesLoading(true);
    const d = detailData || data;
    if (!d) { setClassesLoading(false); return; }
    try {
      const res = await fetch(`${API}/subjects/related/${SCHOOL_ID}/${recordId}/class`);
      if (res.ok) {
        const result = await res.json();
        setClasses(result.records || []);
        setClassesRelDefId(result.relationshipDefinitionId || d.relationshipDefIds?.class || null);
      }
    } catch {}
    setClassesLoading(false);
  };

  // ─── Teacher Link/Unlink ───
  const loadAvailableTeachers = async () => {
    try {
      const res = await fetch(`${API}/subjects/available/${SCHOOL_ID}/${recordId}/teacher`);
      if (res.ok) {
        const d = await res.json();
        setAvailableTeachers(d.records || []);
      }
    } catch {}
  };

  const handleLinkTeacher = async (teacherId: string) => {
    if (!teachersRelDefId) return;
    try {
      const res = await fetch(`${API}/subjects/link/${SCHOOL_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromRecordId: recordId,
          toRecordId: teacherId,
          relationshipDefinitionId: teachersRelDefId,
        }),
      });
      if (res.ok) {
        loadTeachers();
        refreshData();
        onSaved?.();
      }
    } catch {}
  };

  const handleUnlinkTeacher = async (linkId: string) => {
    const typed = await confirm({
      title: 'Remove Teacher',
      message: 'Remove this teacher from the subject\'s assignments?',
      confirmText: 'Remove',
      variant: 'warning',
    });
    if (!typed) return;
    try {
      const res = await fetch(`${API}/subjects/unlink/${SCHOOL_ID}/${linkId}`, { method: 'DELETE' });
      if (res.ok) {
        loadTeachers();
        refreshData();
        onSaved?.();
      }
    } catch {}
  };

  // ─── Learner Link/Unlink ───
  const loadAvailableLearners = async () => {
    try {
      const res = await fetch(`${API}/subjects/available/${SCHOOL_ID}/${recordId}/learner`);
      if (res.ok) {
        const d = await res.json();
        setAvailableLearners(d.records || []);
      }
    } catch {}
  };

  const handleLinkLearner = async (learnerId: string) => {
    if (!learnersRelDefId) return;
    try {
      const res = await fetch(`${API}/subjects/link/${SCHOOL_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromRecordId: recordId,
          toRecordId: learnerId,
          relationshipDefinitionId: learnersRelDefId,
        }),
      });
      if (res.ok) {
        loadLearners();
        refreshData();
        onSaved?.();
      }
    } catch {}
  };

  const handleUnlinkLearner = async (linkId: string) => {
    const typed = await confirm({
      title: 'Remove Learner',
      message: 'Remove this learner from the subject\'s enrollments?',
      confirmText: 'Remove',
      variant: 'warning',
    });
    if (!typed) return;
    try {
      const res = await fetch(`${API}/subjects/unlink/${SCHOOL_ID}/${linkId}`, { method: 'DELETE' });
      if (res.ok) {
        loadLearners();
        refreshData();
        onSaved?.();
      }
    } catch {}
  };

  // ─── Class Link/Unlink ───
  const loadAvailableClasses = async () => {
    try {
      const res = await fetch(`${API}/subjects/available/${SCHOOL_ID}/${recordId}/class`);
      if (res.ok) {
        const d = await res.json();
        setAvailableClasses(d.records || []);
      }
    } catch {}
  };

  const handleLinkClass = async (classId: string) => {
    if (!classesRelDefId) return;
    try {
      const res = await fetch(`${API}/subjects/link/${SCHOOL_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromRecordId: recordId,
          toRecordId: classId,
          relationshipDefinitionId: classesRelDefId,
        }),
      });
      if (res.ok) {
        loadClasses();
        refreshData();
        onSaved?.();
      }
    } catch {}
  };

  const handleUnlinkClass = async (linkId: string) => {
    const typed = await confirm({
      title: 'Remove Class',
      message: 'Remove this class from the subject\'s assignments?',
      confirmText: 'Remove',
      variant: 'warning',
    });
    if (!typed) return;
    try {
      const res = await fetch(`${API}/subjects/unlink/${SCHOOL_ID}/${linkId}`, { method: 'DELETE' });
      if (res.ok) {
        loadClasses();
        refreshData();
        onSaved?.();
      }
    } catch {}
  };

  // ─── Bulk Link ───
  // ─── Add Entire Class (links all learners in a class) ───
  const loadClassLearners = async (classId: string): Promise<any[]> => {
    setLoadingClassLearners(true);
    let result: any[] = [];
    try {
      const res = await fetch(`${API}/subjects/class-learners/${SCHOOL_ID}/${classId}`);
      if (res.ok) {
        const d = await res.json();
        result = d.learners || [];
        setClassLearners(result);
      }
    } catch {}
    setLoadingClassLearners(false);
    return result;
  };

  // Load available classes for "Add Entire Class" feature
  const loadClassesForBulkLink = async () => {
    try {
      // Reuse existing available classes endpoint
      const res = await fetch(`${API}/subjects/available/${SCHOOL_ID}/${recordId}/class`);
      if (res.ok) {
        const d = await res.json();
        setClassesForBulkLink(d.records || []);
      }
    } catch {}
  };

  const handleConfirmLinkEntireClass = async () => {
    if (!learnersRelDefId || classLearners.length === 0) return;
    try {
      const res = await fetch(`${API}/subjects/link-bulk/${SCHOOL_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromRecordId: recordId,
          toRecordIds: classLearners.map(l => l.id),
          relationshipDefinitionId: learnersRelDefId,
        }),
      });
      if (res.ok) {
        setSelectedClassId(null);
        setClassLearners([]);
        loadLearners();
        loadAvailableLearners();
        refreshData();
        onSaved?.();
      }
    } catch {}
  };

  // ─── Identity ───
  const getIdentity = () => {
    if (!data) return { name: 'Subject', photo: null, initials: '??' };
    const vals = data.values;
    const name = vals['subject_name'] || vals['name'] || vals['subject'] || 'Subject';
    const photo = vals['photo'] || vals['image'] || vals['icon'] || null;
    const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
    return { name, photo, initials };
  };

  const getQuickStats = () => {
    if (!data) return [];
    const vals = data.values;
    const stats: Array<{ label: string; value: string; color: string }> = [];
    if (vals['category']) stats.push({ label: 'Category', value: vals['category'], color: '#8b5cf6' });
    if (vals['subject_code']) stats.push({ label: 'Code', value: vals['subject_code'], color: '#6b7280' });
    if (vals['weekly_hours']) stats.push({ label: 'Hrs/Week', value: String(vals['weekly_hours']), color: '#3b82f6' });
    stats.push({ label: 'Teachers', value: String(teachers.length), color: '#d97706' });
    stats.push({ label: 'Learners', value: String(learners.length), color: '#2563eb' });
    stats.push({ label: 'Classes', value: String(classes.length), color: '#059669' });
    return stats.slice(0, 6);
  };

  // ─── Save / Delete ───
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus('idle');
    try {
      const res = await fetch(`${API}/subjects/update/${SCHOOL_ID}/${recordId}`, {
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
        setSaveStatus('error');
      }
    } catch {
      setSaveStatus('error');
    }
    setSaving(false);
  };

  const handlePermanentDelete = async () => {
    const typed = await confirm({
      title: 'Permanently Delete Subject',
      message: 'This will PERMANENTLY delete this subject and ALL related data (teachers, learners, classes). This cannot be undone.',
      confirmText: 'Permanently Delete',
      variant: 'destructive',
      requireTypedConfirm: true,
      typedConfirmText: 'DELETE',
    });
    if (!typed) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API}/subjects/permanent-delete/${SCHOOL_ID}/${recordId}`, { method: 'DELETE' });
      if (res.ok) {
        localStorage.removeItem(CACHE_KEY);
        onDeleted();
      }
    } catch {}
    setDeleting(false);
  };

  if (loading) {
    return (
      <div className="page-enter">
        <button className="btn btn-ghost" onClick={onBack} style={{ gap: 6, marginBottom: 16 }}>
          <ArrowLeft size={15} /> Back to Subjects
        </button>
        <LearnerDetailSkeleton />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page-enter">
        <button className="btn btn-ghost" onClick={onBack} style={{ gap: 6, marginBottom: 16 }}>
          <ArrowLeft size={15} /> Back to Subjects
        </button>
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <p>Subject not found.</p>
        </div>
      </div>
    );
  }

  const identity = getIdentity();
  const quickStats = getQuickStats();

  return (
    <div className="page-enter">
      {/* Back button */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button className="btn btn-ghost" onClick={onBack} style={{ gap: 6 }}>
          <ArrowLeft size={15} /> Back to Subjects
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          {editing ? (
            <>
              <button className="btn btn-secondary" onClick={() => { setEditing(false); setEditValues(data.values || {}); }}>
                <X size={14} /> Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <ASSpinner size="sm" /> : <Save size={14} />}
                {saving ? 'Saving...' : 'Save'}
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={() => setEditing(true)}>
                <Edit3 size={14} /> Edit
              </button>
              <button className="btn btn-secondary" onClick={handlePermanentDelete} disabled={deleting} style={{ color: '#dc2626' }}>
                {deleting ? <ASSpinner size="sm" /> : <Trash2 size={14} />}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Save status */}
      {saveStatus === 'success' && (
        <div style={{ padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, marginBottom: 16, fontSize: '0.8rem', color: '#16a34a' }}>
          Subject saved successfully.
        </div>
      )}
      {saveStatus === 'error' && (
        <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, marginBottom: 16, fontSize: '0.8rem', color: '#991b1b' }}>
          Failed to save. Please try again.
        </div>
      )}

      {/* Header card */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Avatar name={identity.name} photo={identity.photo} size={56} />
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 4 }}>{identity.name}</h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {quickStats.map((stat, i) => (
                <span key={i} className="badge" style={{ background: stat.color + '15', color: stat.color, fontWeight: 600, fontSize: '0.75rem' }}>
                  {stat.label}: {stat.value}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Relationship panels — Teachers */}
      <RelationshipInlinePanel
        title="Teachers" icon={GraduationCap} entries={teachers} loading={teachersLoading}
        apiPrefix="subjects" recordId={recordId}
        available={availableTeachers} loadAvailable={loadAvailableTeachers}
        handleLink={handleLinkTeacher} handleUnlink={handleUnlinkTeacher}
        onBulkLinked={() => { loadTeachers(); loadAvailableTeachers(); refreshData(); onSaved?.(); }}
        emptyMessage="No teachers assigned to this subject yet."
        linkMessage="Add Teacher" targetEntity="teacher" relDefId={teachersRelDefId}
      />

      {/* Relationship panels — Learners */}
      <RelationshipInlinePanel
        title="Learners" icon={Users} entries={learners} loading={learnersLoading}
        apiPrefix="subjects" recordId={recordId}
        available={availableLearners} loadAvailable={loadAvailableLearners}
        handleLink={handleLinkLearner} handleUnlink={handleUnlinkLearner}
        onBulkLinked={() => { loadLearners(); loadAvailableLearners(); refreshData(); onSaved?.(); }}
        emptyMessage="No learners enrolled in this subject yet."
        linkMessage="Add Learner" targetEntity="learner" relDefId={learnersRelDefId}
        bulkGroup={{
          loadGroups: loadClassesForBulkLink,
          groups: classesForBulkLink,
          loadGroupMembers: loadClassLearners,
          onConfirmBulkGroup: handleConfirmLinkEntireClass,
        }}
      />

      {/* Relationship panels — Classes */}
      <RelationshipInlinePanel
        title="Classes" icon={School} entries={classes} loading={classesLoading}
        apiPrefix="subjects" recordId={recordId}
        available={availableClasses} loadAvailable={loadAvailableClasses}
        handleLink={handleLinkClass} handleUnlink={handleUnlinkClass}
        onBulkLinked={() => { loadClasses(); loadAvailableClasses(); refreshData(); onSaved?.(); }}
        emptyMessage="No classes assigned to this subject yet."
        linkMessage="Add Class" targetEntity="class" relDefId={classesRelDefId}
      />

      {/* Sections & Fields */}
      {data.sections && data.sections.length > 0 && data.sections.map((section) => (
        section.fields && section.fields.length > 0 && (
          <div key={section.id} className="card" style={{ padding: 20, marginBottom: 16 }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#374151', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #f3f4f6' }}>
              {section.name}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
              {section.fields.map((field: any) => (
                <div key={field.id}>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, color: '#6b7280', marginBottom: 4 }}>{field.name}</label>
                  {editing ? (
                    <DynamicField
                      field={field}
                      value={editValues[field.internalName]}
                      onChange={(val) => setEditValues(prev => ({ ...prev, [field.internalName]: val }))}
                    />
                  ) : (
                    <FieldValueDisplay field={field} value={data.values[field.internalName]} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      ))}

      {/* Unsectioned fields */}
      {data.unsectionedFields && data.unsectionedFields.length > 0 && (
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#374151', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #f3f4f6' }}>
            Additional Information
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            {data.unsectionedFields.map((field: any) => (
              <div key={field.id}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, color: '#6b7280', marginBottom: 4 }}>{field.name}</label>
                {editing ? (
                  <DynamicField
                    field={field}
                    value={editValues[field.internalName]}
                    onChange={(val) => setEditValues(prev => ({ ...prev, [field.internalName]: val }))}
                  />
                ) : (
                  <FieldValueDisplay field={field} value={data.values[field.internalName]} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Created / Updated */}
      <div style={{ fontSize: '0.75rem', color: '#9ca3af', textAlign: 'right', padding: '8px 0' }}>
        {data.createdAt && <span>Created: {new Date(data.createdAt).toLocaleDateString()}</span>}
        {data.updatedAt && <span style={{ marginLeft: 16 }}>Updated: {new Date(data.updatedAt).toLocaleDateString()}</span>}
      </div>
    </div>
  );
}
