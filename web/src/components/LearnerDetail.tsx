// Learner Detail/Profile View — visually appealing card layout
// Photo upload, inline editing, export, related records

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft, Edit3, Trash2, Users, School,
  BookOpen, Calendar, ClipboardCheck, Wallet,
  ChevronRight, Save, X, Download, FileText,
  GripVertical,
} from 'lucide-react';
import ASSpinner from './ASSpinner';
import Avatar from './Avatar';
import { LearnerDetailSkeleton } from './Skeleton';
import DynamicField from './DynamicField';
import DraggableFieldList from './DraggableFieldList';
import FieldValueDisplay from './FieldValueDisplay';
import { useConfirm } from './ConfirmProvider';
import { loadCache, saveCache, fetchVersions } from '../lib/cache';
import { sortFieldsByOrder } from '../lib/fieldOrder';

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
  createdAt: string;
  updatedAt: string;
}

interface Props {
  recordId: string;
  initialData: { id: string; values: Record<string, any> } | null;
  onBack: () => void;
  onDeleted: () => void;
  onSaved?: () => void;
}

const RELATED_META: Record<string, { icon: any; color: string; label: string }> = {
  classes: { icon: School, color: '#22c55e', label: 'Classes' },
  subjects: { icon: BookOpen, color: '#a855f7', label: 'Subjects' },
  teachers: { icon: Users, color: '#f59e0b', label: 'Teachers' },
  terms: { icon: Calendar, color: '#ef4444', label: 'Terms' },
  enrollments: { icon: ClipboardCheck, color: '#06b6d4', label: 'Enrollments' },
  assessments: { icon: ClipboardCheck, color: '#ec4899', label: 'Assessments' },
  guardians: { icon: Users, color: '#8b5cf6', label: 'Guardians' },
  finance: { icon: Wallet, color: '#16a34a', label: 'Finance' },
};

export default function LearnerDetail({ recordId, initialData, onBack, onDeleted, onSaved }: Props) {
  const { confirm } = useConfirm();
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteInfo, setDeleteInfo] = useState<any>(null);
  const [showReorder, setShowReorder] = useState(false);

  // Persistent cache for individual record
  const CACHE_KEY = `anyschool_record_${SCHOOL_ID}_${recordId}`;

  // On mount: show skeleton briefly, then either cache/initialData/API data
  useEffect(() => {
    let hadCache = false;

    // 1. Try cache (new format)
    const cached = loadCache<any>(CACHE_KEY);
    if (cached) {
      setData(cached.data);
      setEditValues(cached.data.values || {});
      hadCache = true;
      setLoading(false);
    }

    // 2. Try initialData from list
    if (!hadCache && initialData) {
      setData({ ...initialData, sections: [], unsectionedFields: [], related: {}, createdAt: '', updatedAt: '' } as any);
      setEditValues(initialData.values || {});
      hadCache = true;
      setLoading(false);
    }

    // 3. Fetch full detail in background
    fetch(`${API}/learners/record/${SCHOOL_ID}/${recordId}`).then(r => r.json()).then(async d => {
      setData(d);
      setEditValues(d.values || {});
      const versions = await fetchVersions(SCHOOL_ID);
      saveCache(CACHE_KEY, d, versions || {});
      setLoading(false);
    }).catch(() => { if (!hadCache) setLoading(false); });
  }, [recordId]);

  const getIdentity = () => {
    if (!data) return { name: 'Learner', photo: null, initials: '??' };
    const vals = data.values;
    const firstName = vals['first_name'] || '';
    const lastName = vals['last_name'] || '';
    const name = vals['full_name'] || vals['name'] ||
      [firstName, lastName].filter(Boolean).join(' ') ||
      vals['learner_name'] || 'Learner';
    const photo = vals['photo'] || vals['passport_photo'] || vals['avatar'] || null;
    const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
    return { name, photo, initials };
  };

  // Get quick stats for the summary bar
  const getQuickStats = () => {
    if (!data) return [];
    const vals = data.values;
    const stats: Array<{ label: string; value: string; color: string }> = [];
    if (vals['status']) stats.push({ label: 'Status', value: vals['status'], color: vals['status'] === 'Active' ? '#22c55e' : '#f59e0b' });
    if (vals['grade_level']) stats.push({ label: 'Grade', value: vals['grade_level'], color: '#3b82f6' });
    if (vals['class_name']) stats.push({ label: 'Class', value: vals['class_name'], color: '#8b5cf6' });
    if (vals['gender']) stats.push({ label: 'Gender', value: vals['gender'], color: vals['gender'] === 'Male' ? '#3b82f6' : '#ec4899' });
    if (vals['fee_balance'] !== undefined && vals['fee_balance'] !== null) {
      stats.push({ label: 'Balance', value: `KES ${Number(vals['fee_balance'] || 0).toLocaleString()}`, color: Number(vals['fee_balance']) > 0 ? '#ef4444' : '#22c55e' });
    }
    return stats.slice(0, 5);
  };

  // Refresh data from API (after mutations)
  const refreshData = async () => {
    try {
      const res = await fetch(`${API}/learners/record/${SCHOOL_ID}/${recordId}`);
      if (res.ok) {
        const d = await res.json();
        setData(d);
        setEditValues(d.values || {});
        const versions = await fetchVersions(SCHOOL_ID);
        saveCache(CACHE_KEY, d, versions || {});
      }
    } catch {}
  };

  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus('idle');
    try {
      const res = await fetch(`${API}/learners/update/${SCHOOL_ID}/${recordId}`, {
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

  const handleDelete = async () => {
    if (!confirmDelete) {
      setDeleting(true);
      try {
        const res = await fetch(`${API}/learners/delete/${SCHOOL_ID}/${recordId}`, { method: 'DELETE' });
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
      const res = await fetch(`${API}/learners/delete/${SCHOOL_ID}/${recordId}`, { method: 'DELETE' });
      if (res.ok) onDeleted();
    } catch {}
    setDeleting(false);
  };

  const handlePermanentDelete = async () => {
    const studentName = data?.values?.full_name || data?.values?.name || data?.values?.first_name || 'this student';
    const typed = await confirm({
      title: 'Permanently Delete Student',
      message: `This will PERMANENTLY delete ${studentName} and all related records (enrollments, assessments, etc). This cannot be undone.`,
      confirmText: 'Permanently Delete',
      variant: 'destructive',
      requireTypedConfirm: true,
      typedConfirmText: studentName,
    });
    if (!typed) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API}/learners/permanent-delete/${SCHOOL_ID}/${recordId}`, { method: 'DELETE' });
      if (res.ok) onDeleted();
    } catch {}
    setDeleting(false);
  };

  const handlePhotoUpload = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setEditValues(prev => ({ ...prev, photo: dataUrl }));
      const res = await fetch(`${API}/learners/update/${SCHOOL_ID}/${recordId}`, {
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

  const handleExport = () => {
    if (!data) return;
    const vals = data.values;
    const allFields = [
      ...data.sections.flatMap(s => s.fields),
      ...data.unsectionedFields,
    ];
    const headers = allFields.map(f => f.name);
    const values = allFields.map(f => {
      const v = vals[f.internalName];
      if (v === null || v === undefined) return '';
      if (typeof v === 'string' && v.startsWith('data:')) return '[Photo]';
      return String(v);
    });
    const csv = [headers.join(','), values.map(v => `"${v.replace(/"/g, '""')}"`).join(',')].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `learner_${getIdentity().name.replace(/\s+/g, '_')}_${data.id.slice(0, 8)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const updateEditField = (name: string, value: any) => {
    setEditValues(prev => ({ ...prev, [name]: value }));
  };

  if (loading) {
    return (
      <div className="page-enter" style={{ padding: 20 }}>
        <LearnerDetailSkeleton />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page-enter" style={{ padding: 40, textAlign: 'center' }}>
        <p>Record not found.</p>
        <button className="btn btn-secondary" onClick={onBack} style={{ marginTop: 12 }}>
          <ArrowLeft size={15} /> Back to Learners
        </button>
      </div>
    );
  }

  const identity = getIdentity();
  const quickStats = getQuickStats();
  const relatedKeys = Object.keys(data.related || {});

  return (
    <div className="page-enter learner-detail">
      {/* Back button */}
      <div style={{ marginBottom: 20 }}>
        <button className="btn btn-ghost" onClick={onBack} style={{ gap: 6 }}>
          <ArrowLeft size={15} /> Back to Learners
        </button>
      </div>

      {/* ─── Hero Profile Card ────────────────────────────── */}
      <div style={{
        background: `linear-gradient(135deg, color-mix(in srgb, var(--brand-primary) 30%, #1a1a2e) 0%, color-mix(in srgb, var(--brand-primary) 20%, #1a1a2e) 50%, color-mix(in srgb, var(--brand-primary) 15%, #1a1a2e) 100%)`,
        borderRadius: 16, padding: '32px 32px 24px', marginBottom: 20,
        position: 'relative', overflow: 'hidden', opacity: 0.85,
      }}>
        {/* Subtle pattern overlay */}
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
              {data.values['admission_number'] && (
                <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace' }}>
                  #{data.values['admission_number']}
                </span>
              )}
              {data.values['status'] && (
                <span style={{
                  fontSize: '0.75rem', fontWeight: 600, padding: '2px 10px', borderRadius: 12,
                  background: data.values['status'] === 'Active' ? 'rgba(34,197,94,0.2)' : 'rgba(245,158,11,0.2)',
                  color: data.values['status'] === 'Active' ? '#86efac' : '#fcd34d',
                }}>
                  {data.values['status']}
                </span>
              )}
              {data.values['gender'] && (
                <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>
                  {data.values['gender']}
                </span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {editing ? (
              <>
                <button className="btn" onClick={() => { setEditing(false); setEditValues(data.values); }}
                  style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}>
                  <X size={14} /> Cancel
                </button>
                <button
                  className="btn"
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    background: saveStatus === 'success' ? '#22c55e' : saveStatus === 'error' ? '#ef4444' : 'white',
                    color: saveStatus === 'success' || saveStatus === 'error' ? '#fff' : '#1e3a5f',
                    fontWeight: 600,
                  }}
                >
                  {saving ? <ASSpinner size="sm" /> : saveStatus === 'success' ? '\u2713' : saveStatus === 'error' ? '\u2717' : <Save size={14} />}
                  {saving ? 'Saving...' : saveStatus === 'success' ? 'Saved!' : saveStatus === 'error' ? 'Failed' : 'Save'}
                </button>
              </>
            ) : (
              <>
                <button className="btn" onClick={handleExport}
                  style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}>
                  <Download size={14} /> Export
                </button>
                <button className="btn" onClick={() => setShowReorder(true)}
                  style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}>
                  <GripVertical size={14} /> Reorder
                </button>
                <button className="btn" onClick={() => setEditing(true)}
                  style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}>
                  <Edit3 size={14} /> Edit
                </button>
                <button className="btn" onClick={handleDelete} disabled={deleting}
                  style={{ background: 'rgba(239,68,68,0.2)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)' }}>
                  {deleting ? <ASSpinner size="sm" /> : <Trash2 size={14} />}
                  {confirmDelete ? 'Confirm Archive' : 'Archive'}
                </button>
                <button className="btn" onClick={handlePermanentDelete} disabled={deleting}
                  style={{ background: 'rgba(239,68,68,0.35)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.5)', fontSize: '0.75rem' }}>
                  Delete Forever
                </button>
              </>
            )}
          </div>
        </div>

        {/* Quick stats bar */}
        {quickStats.length > 0 && (
          <div style={{
            display: 'flex', gap: 16, marginTop: 20, paddingTop: 16,
            borderTop: '1px solid rgba(255,255,255,0.1)', position: 'relative', zIndex: 1,
          }}>
            {quickStats.map((stat, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: stat.color }} />
                <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>{stat.label}</span>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'white' }}>{stat.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete warnings */}
      {confirmDelete && deleteInfo && (
        <div style={{
          padding: '12px 16px', borderRadius: 10, marginBottom: 20,
          background: '#fef2f2', border: '1px solid #fecaca',
          fontSize: '0.85rem', color: '#991b1b',
        }}>
          This will archive the learner record.
          {deleteInfo.affected?.relationships > 0 && (
            <> <strong>{deleteInfo.affected.relationships}</strong> linked relationship(s) will also be hidden.</>
          )}
        </div>
      )}

      {/* ─── Sections Grid ────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 20 }}>
        {data.sections.map((section) => {
          const sortedFields = sortFieldsByOrder(section.fields, 'learner', SCHOOL_ID);
          return (
          <div key={section.id} style={{
            background: 'white', borderRadius: 12, border: '1px solid #f3f4f6',
            overflow: 'hidden', animation: 'fadeSlideUp 0.3s ease forwards',
          }}>
            {/* Section header */}
            <div style={{
              padding: '12px 20px', background: '#f9fafb',
              borderBottom: '1px solid #f3f4f6',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151', margin: 0 }}>
                {section.name}
              </h3>
              {editing && (
                <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: '#dbeafe', color: '#2563eb' }}>
                  EDITING
                </span>
              )}
            </div>
            {/* Fields */}
            <div style={{ padding: '12px 20px' }}>
              {sortedFields.map((field: any) => (
                <div key={field.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 0', borderBottom: '1px solid #f9fafb',
                }}>
                  <span style={{ fontSize: '0.8rem', color: '#6b7280', flexShrink: 0, marginRight: 16 }}>
                    {field.name}
                  </span>
                  {editing ? (
                    <div style={{ flex: 1, maxWidth: 240 }}>
                      <DynamicField
                        field={field}
                        value={editValues[field.internalName]}
                        onChange={(val) => updateEditField(field.internalName, val)}
                        compact
                      />
                    </div>
                  ) : (
                    <span style={{
                      fontSize: '0.85rem', fontWeight: 500, color: '#111827',
                      textAlign: 'right', maxWidth: 240, wordBreak: 'break-word',
                    }}>
                      <FieldValueDisplay
                        field={field}
                        value={data.values[field.internalName]}
                        displayName={getIdentity().name}
                        imageSize={40}
                      />
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
          );
        })}

        {/* Unsectioned fields */}
        {data.unsectionedFields.length > 0 && (() => {
          const sortedUnsectioned = sortFieldsByOrder(data.unsectionedFields, 'learner', SCHOOL_ID);
          return (
          <div style={{
            background: 'white', borderRadius: 12, border: '1px solid #f3f4f6',
            overflow: 'hidden', animation: 'fadeSlideUp 0.3s ease forwards',
          }}>
            <div style={{
              padding: '12px 20px', background: '#f9fafb',
              borderBottom: '1px solid #f3f4f6',
            }}>
              <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151', margin: 0 }}>
                Additional Information
              </h3>
            </div>
            <div style={{ padding: '12px 20px' }}>
              {sortedUnsectioned.map((field: any) => (
                <div key={field.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 0', borderBottom: '1px solid #f9fafb',
                }}>
                  <span style={{ fontSize: '0.8rem', color: '#6b7280', flexShrink: 0, marginRight: 16 }}>
                    {field.name}
                  </span>
                  {editing ? (
                    <div style={{ flex: 1, maxWidth: 240 }}>
                      <DynamicField
                        field={field}
                        value={editValues[field.internalName]}
                        onChange={(val) => updateEditField(field.internalName, val)}
                        compact
                      />
                    </div>
                  ) : (
                    <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#111827', textAlign: 'right' }}>
                      <FieldValueDisplay
                        field={field}
                        value={data.values[field.internalName]}
                        displayName={getIdentity().name}
                        imageSize={40}
                      />
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
          );
        })()}
      </div>

      {/* ─── Related Records ──────────────────────────────── */}
      {relatedKeys.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: 12, color: '#374151' }}>
            Linked Records
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            {relatedKeys.map((key) => {
              const meta = RELATED_META[key] || { icon: FileText, color: '#6b7280', label: key };
              const items = data.related[key] || [];
              const RelIcon = meta.icon;
              return (
                <div key={key} style={{
                  background: 'white', borderRadius: 12, border: '1px solid #f3f4f6',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    padding: '12px 16px', borderBottom: '1px solid #f3f4f6',
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: meta.color + '12',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <RelIcon size={16} style={{ color: meta.color }} />
                    </div>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>{meta.label}</span>
                    <span style={{
                      marginLeft: 'auto', fontSize: '0.7rem', fontWeight: 600,
                      padding: '2px 8px', borderRadius: 10,
                      background: meta.color + '15', color: meta.color,
                    }}>
                      {items.length}
                    </span>
                  </div>
                  {items.length > 0 ? (
                    <div style={{ padding: '8px 0' }}>
                      {items.slice(0, 3).map((item: any, i: number) => (
                        <div key={item.id || i} style={{
                          padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          fontSize: '0.8rem', color: '#374151',
                        }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {Object.values(item.values || {}).slice(0, 2).join(' · ') || item.id.slice(0, 8)}
                          </span>
                          <ChevronRight size={12} style={{ color: '#d1d5db', flexShrink: 0 }} />
                        </div>
                      ))}
                      {items.length > 3 && (
                        <div style={{ padding: '6px 16px', fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center' }}>
                          +{items.length - 3} more
                        </div>
                      )}
                    </div>
                  ) : (
                    <p style={{ padding: '16px', fontSize: '0.8rem', color: '#d1d5db', textAlign: 'center' }}>
                      No linked records
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Metadata footer ──────────────────────────────── */}
      <div style={{
        padding: '12px 20px', borderRadius: 10, background: '#f9fafb',
        display: 'flex', gap: 24, fontSize: '0.75rem', color: '#9ca3af', flexWrap: 'wrap',
      }}>
        <span>Created: {new Date(data.createdAt).toLocaleDateString()}</span>
        <span>Updated: {new Date(data.updatedAt).toLocaleDateString()}</span>
        <span style={{ fontFamily: 'monospace' }}>ID: {data.id.slice(0, 8)}...</span>
      </div>

      {/* ─── Reorder Modal ──────────────────────────────── */}
      {showReorder && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9998,
          background: 'rgba(0,0,0,0.3)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(4px)',
        }} onClick={() => setShowReorder(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 14, width: 420, maxHeight: '80vh',
            overflowY: 'auto', padding: 24,
            boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Reorder Fields</h3>
              <button onClick={() => setShowReorder(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={18} style={{ color: '#9ca3af' }} />
              </button>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: 12 }}>
              Drag fields to reorder. This affects which columns appear in the list view and their order.
            </p>
            <DraggableFieldList
              entityType="learner"
              schoolId={SCHOOL_ID}
              fields={sortFieldsByOrder([
                ...data.sections.flatMap(s => s.fields),
                ...data.unsectionedFields,
              ], 'learner', SCHOOL_ID).map((f: any) => ({
                id: f.id,
                name: f.name,
                internalName: f.internalName,
                dataType: f.dataType,
                value: data.values[f.internalName],
                isRequired: f.isRequired,
                isIdentifier: f.isIdentifier,
              }))}
              onOrderChanged={() => {
                // Re-fetch to apply new order
                refreshData();
              }}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
