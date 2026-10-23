// Add Class Form — fully dynamic
// Fields come from API. Users can add/remove/rename fields via FieldManager.

import { useState, useEffect } from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import ASSpinner from './ASSpinner';
import FieldManager from './FieldManager';
import DynamicField, { FieldSchema } from './DynamicField';
import { FormSkeleton } from './Skeleton';
import { useOrderedFields } from '../lib/useOrderedFields';

const API = '/api';
const SCHOOL_ID = localStorage.getItem('anyschool_current_school') || '88374870-9175-4565-a876-f17c2e295519';

interface Props {
  onCreated: () => void;
  onCancel: () => void;
}

export default function AddClassForm({ onCreated, onCancel }: Props) {
  const {
    fields, setFields, orderedFieldsOnly, onLocalFieldsChange, onVisibilityChanged,
  } = useOrderedFields('class');
  const [sections, setSections] = useState<any[]>([]);
  const [values, setValues] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showFieldManager, setShowFieldManager] = useState(false);
  const [parentRecordId, setParentClassId] = useState<string>('');
  const [existingClasses, setExistingClasses] = useState<Array<{ id: string; name: string; depth: number }>>([]);

  const loadFields = async () => {
    setLoading(true);
    try {
      const [fieldsRes, typesRes, listRes] = await Promise.all([
        fetch(`${API}/classes/fields/${SCHOOL_ID}`),
        fetch(`${API}/schema/entity-types?schoolId=${SCHOOL_ID}`),
        fetch(`${API}/classes/list/${SCHOOL_ID}`),
      ]);
      if (fieldsRes.ok) {
        const data = await fieldsRes.json();
        setFields(data.fields || []);
      }
      if (typesRes.ok) {
        const types = await typesRes.json();
        const classType = types.find((t: any) => t.internalName === 'class');
        if (classType) {
          const detailRes = await fetch(`${API}/schema/entity-types/${classType.id}?schoolId=${SCHOOL_ID}`);
          if (detailRes.ok) {
            const detail = await detailRes.json();
            setSections(detail.sections || []);
          }
        }
      }
      if (listRes.ok) {
        const data = await listRes.json();
        // Build tree-aware list: only show top-level classes (no parentRecordId) as potential parents
        const classList = (data.records || [])
          .filter((r: any) => !r.parentRecordId)
          .map((r: any) => ({
            id: r.id,
            name: r.values?.class_name || r.values?.name || 'Unnamed',
            depth: 0,
          }));
        setExistingClasses(classList);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadFields(); }, []);

  const updateField = (name: string, value: any) => {
    setValues(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API}/classes/create/${SCHOOL_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values, parentRecordId: parentRecordId || null }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onCreated();
      } else {
        setError(data.error || 'Failed to create class');
      }
    } catch {
      setError('Network error — please try again');
    }
    setSaving(false);
  };

  const sectionedFields = sections.map(section => ({
    ...section,
    fields: fields.filter(f => f.sectionId === section.id),
  }));
  const unsectionedFields = fields.filter(f => !f.sectionId);

  return (
    <div className="page-enter">
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button className="btn btn-ghost" onClick={onCancel} style={{ gap: 6 }}>
          <ArrowLeft size={15} /> Back to Classes
        </button>
        <button className="btn btn-secondary" onClick={() => setShowFieldManager(!showFieldManager)} style={{ fontSize: '0.8rem' }}>
          {showFieldManager ? 'Hide Field Manager' : 'Manage Fields'}
        </button>
      </div>

      {showFieldManager && (
        <FieldManager
          fields={orderedFieldsOnly}
          entityType="class"
          onFieldsChanged={loadFields}
          onLocalFieldsChange={onLocalFieldsChange}
          onVisibilityChanged={onVisibilityChanged}
        />
      )}

      <div className="card" style={{ padding: 24, maxWidth: 720 }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 4 }}>Add New Class</h2>
        <p className="text-muted" style={{ marginBottom: 24, fontSize: '0.85rem' }}>
          Fill in the class details. Required fields are marked with *.
        </p>

        {error && (
          <div className="card" style={{ padding: 12, marginBottom: 16, background: '#fef2f2', border: '1px solid #fecaca' }}>
            <p style={{ fontSize: '0.85rem', color: '#991b1b' }}>{error}</p>
          </div>
        )}

        {/* Parent class selector (optional) */}
        {existingClasses.length > 0 && !loading && (
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 500, color: '#64748b', display: 'block', marginBottom: 4 }}>
              Parent Class (optional — leave empty for top-level)
            </label>
            <select
              className="select"
              value={parentRecordId}
              onChange={e => setParentClassId(e.target.value)}
              style={{ fontSize: '0.85rem' }}
            >
              <option value="">None — Top-level class</option>
              {existingClasses.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: 4 }}>
              Select a parent to make this a stream/section of an existing class.
            </p>
          </div>
        )}

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <FormSkeleton fields={6} />
          </div>
        ) : fields.length === 0 ? (
          <div className="empty-state" style={{ padding: 40 }}>
            <p style={{ marginBottom: 12 }}>No fields defined yet for Classes.</p>
            <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: 16 }}>
              Click "Manage Fields" above to create fields, or use the Schema Builder.
            </p>
          </div>
        ) : (
          <>
            {sectionedFields.map((section) => (
              section.fields.length > 0 && (
                <div key={section.id} style={{ marginBottom: 24 }}>
                  <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#374151', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #f3f4f6' }}>
                    {section.name}
                  </h3>
                  <div className="form-grid">
                    {section.fields.map((field: FieldSchema) => (
                      <DynamicField
                        key={field.id}
                        field={field}
                        value={values[field.internalName]}
                        onChange={(val) => updateField(field.internalName, val)}
                      />
                    ))}
                  </div>
                </div>
              )
            ))}

            {unsectionedFields.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#374151', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #f3f4f6' }}>
                  Additional Information
                </h3>
                <div className="form-grid">
                  {unsectionedFields.map((field: FieldSchema) => (
                    <DynamicField
                      key={field.id}
                      field={field}
                      value={values[field.internalName]}
                      onChange={(val) => updateField(field.internalName, val)}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20, paddingTop: 16, borderTop: '1px solid #f3f4f6' }}>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving || fields.length === 0}>
            {saving ? <ASSpinner size="sm" /> : <Plus size={14} />}
            {saving ? 'Creating...' : 'Create Class'}
          </button>
        </div>
      </div>
    </div>
  );
}
