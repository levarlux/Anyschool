// Term Detail — hierarchy-first layout
// Shows identity/date-range, parent/children, editable fields, relationships

import { useState, useEffect } from 'react';
import {
  ArrowLeft, Edit3, Trash2, Save, X, Calendar, ChevronRight,
} from 'lucide-react';
import ASSpinner from './ASSpinner';
import { LearnerDetailSkeleton } from './Skeleton';
import DynamicField from './DynamicField';
import FieldValueDisplay from './FieldValueDisplay';
import { useConfirm } from './ConfirmProvider';

const API = '/api';
const SCHOOL_ID = localStorage.getItem('anyschool_current_school') || '88374870-9175-4565-a876-f17c2e295519';

interface Props {
  recordId: string;
  initialData: any;
  onBack: () => void;
  onDeleted: () => void;
  onSaved: () => void;
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  Active: { bg: '#dcfce7', color: '#16a34a' },
  Completed: { bg: '#f3f4f6', color: '#6b7280' },
  Upcoming: { bg: '#dbeafe', color: '#2563eb' },
};

export default function TermDetail({ recordId, initialData, onBack, onDeleted, onSaved }: Props) {
  const { confirm } = useConfirm();
  const [data, setData] = useState<any>(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!data) loadRecord();
  }, [recordId]);

  const loadRecord = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/terms/record/${SCHOOL_ID}/${recordId}`);
      if (res.ok) {
        const d = await res.json();
        setData(d);
        setEditValues(d.values || {});
      }
    } catch {}
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus('idle');
    try {
      const res = await fetch(`${API}/terms/update/${SCHOOL_ID}/${recordId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: editValues }),
      });
      if (res.ok) {
        setSaveStatus('success');
        setEditing(false);
        setData((prev: any) => ({ ...prev, values: editValues }));
        onSaved?.();
        setTimeout(() => setSaveStatus('idle'), 2000);
      } else {
        setSaveStatus('error');
      }
    } catch {
      setSaveStatus('error');
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    const typed = await confirm({
      title: 'Delete Term',
      message: 'This will PERMANENTLY delete this term and all related records. This cannot be undone.',
      confirmText: 'Permanently Delete',
      variant: 'destructive',
      requireTypedConfirm: true,
      typedConfirmText: 'DELETE',
    });
    if (!typed) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API}/terms/permanent-delete/${SCHOOL_ID}/${recordId}`, { method: 'DELETE' });
      if (res.ok) onDeleted();
    } catch {}
    setDeleting(false);
  };

  const handleEditField = (internalName: string, value: any) => {
    setEditValues(prev => ({ ...prev, [internalName]: value }));
  };

  if (loading) {
    return (
      <div className="page-enter">
        <button className="btn btn-ghost" onClick={onBack} style={{ gap: 6, marginBottom: 16 }}>
          <ArrowLeft size={15} /> Back to Terms
        </button>
        <LearnerDetailSkeleton />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page-enter">
        <button className="btn btn-ghost" onClick={onBack} style={{ gap: 6, marginBottom: 16 }}>
          <ArrowLeft size={15} /> Back to Terms
        </button>
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <p style={{ color: '#9ca3af' }}>Term not found.</p>
        </div>
      </div>
    );
  }

  const vals = data.values || {};
  const termName = vals.term_name || vals.name || 'Unnamed Term';
  const status = vals.status || 'Unknown';
  const statusStyle = STATUS_COLORS[status] || { bg: '#f3f4f6', color: '#6b7280' };
  const startDate = vals.start_date;
  const endDate = vals.end_date;
  const academicYear = vals.academic_year;
  const parent = data.parent;
  const children = data.children || [];
  const fields = data.fields || [];

  // Group fields by section
  const sectionMap = new Map<string, { id: string; name: string; fields: any[] }>();
  for (const f of fields) {
    const sectionId = f.sectionId || '__unsectioned';
    if (!sectionMap.has(sectionId)) {
      sectionMap.set(sectionId, { id: sectionId, name: sectionId === '__unsectioned' ? 'General' : sectionId, fields: [] });
    }
    sectionMap.get(sectionId)!.fields.push(f);
  }
  const sectionGroups = Array.from(sectionMap.values());

  return (
    <div className="page-enter">
      <button className="btn btn-ghost" onClick={onBack} style={{ gap: 6, marginBottom: 16 }}>
        <ArrowLeft size={15} /> Back to Terms
      </button>

      {/* Header Card */}
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: '#faf5ff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Calendar size={24} style={{ color: '#7c3aed' }} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0 }}>{termName}</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <span className="badge" style={{ background: statusStyle.bg, color: statusStyle.color, fontWeight: 600 }}>
                  {status}
                </span>
                {academicYear && <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>{academicYear}</span>}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {editing ? (
              <>
                <button className="btn btn-secondary" onClick={() => { setEditing(false); setEditValues(data.values || {}); }}>
                  <X size={14} /> Cancel
                </button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? <ASSpinner size="sm" /> : saveStatus === 'success' ? '✓' : saveStatus === 'error' ? '✗' : <Save size={14} />}
                  {saving ? 'Saving...' : saveStatus === 'success' ? 'Saved!' : 'Save'}
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-secondary" onClick={() => { setEditing(true); setEditValues(data.values || {}); }}>
                  <Edit3 size={14} /> Edit
                </button>
                <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                  {deleting ? <ASSpinner size="sm" /> : <Trash2 size={14} />}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Date range — prominent for Terms */}
        {(startDate || endDate) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#f9fafb', borderRadius: 8, border: '1px solid #f3f4f6' }}>
            <Calendar size={14} style={{ color: '#7c3aed' }} />
            <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#374151' }}>
              {startDate || '?'} → {endDate || '?'}
            </span>
          </div>
        )}
      </div>

      {/* Parent Term */}
      {parent && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 8 }}>
            <ChevronRight size={14} style={{ color: '#9ca3af' }} /> Parent Term
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#f9fafb', borderRadius: 8, border: '1px solid #f3f4f6' }}>
            <Calendar size={14} style={{ color: '#7c3aed' }} />
            <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>
              {parent.values?.term_name || parent.values?.name || 'Unnamed'}
            </span>
            {parent.values?.status && (
              <span className="badge" style={{
                background: STATUS_COLORS[parent.values.status]?.bg || '#f3f4f6',
                color: STATUS_COLORS[parent.values.status]?.color || '#6b7280',
                fontSize: '0.7rem',
              }}>
                {parent.values.status}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Children Terms */}
      {children.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 8 }}>
            Child Terms ({children.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {children.map((child: any) => {
              const childName = child.values?.term_name || child.values?.name || 'Unnamed';
              const childStatus = child.values?.status || 'Unknown';
              const childStatusStyle = STATUS_COLORS[childStatus] || { bg: '#f3f4f6', color: '#6b7280' };
              return (
                <div key={child.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: '#f9fafb', border: '1px solid #f3f4f6' }}>
                  <Calendar size={14} style={{ color: '#7c3aed' }} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 500, flex: 1 }}>{childName}</span>
                  <span className="badge" style={{ background: childStatusStyle.bg, color: childStatusStyle.color, fontSize: '0.7rem' }}>
                    {childStatus}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Fields */}
      {sectionGroups.map(section => (
        section.fields.length > 0 && (
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
                      onChange={(v) => handleEditField(field.internalName, v)}
                    />
                  ) : (
                    <FieldValueDisplay field={field} value={vals[field.internalName]} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      ))}
    </div>
  );
}
