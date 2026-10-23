// AddTermForm — Create a new Term record
// Fields come from API. Users can add/remove/rename fields via FieldManager.

import { useState } from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import ASSpinner from './ASSpinner';
import DynamicField from './DynamicField';
import { useEntityFields } from '../lib/useEntityFields';

const API = '/api';
const SCHOOL_ID = localStorage.getItem('anyschool_current_school') || '88374870-9175-4565-a876-f17c2e295519';

interface Props {
  onCreated: () => void;
  onCancel: () => void;
}

export default function AddTermForm({ onCreated, onCancel }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [values, setValues] = useState<Record<string, any>>({});

  const fetchList = async () => {
    const res = await fetch(`${API}/terms/list/${SCHOOL_ID}`);
    if (!res.ok) throw new Error('Failed');
    return res.json();
  };

  const { fields, orderedFieldsOnly } = useEntityFields('term', fetchList);

  const handleChange = (internalName: string, value: any) => {
    setValues(prev => ({ ...prev, [internalName]: value }));
  };

  const handleSubmit = async () => {
    setError('');
    setSaving(true);
    try {
      const res = await fetch(`${API}/terms/create/${SCHOOL_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values, parentRecordId: values.__parentTermId || null }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onCreated();
      } else {
        setError(data.error || 'Failed to create term');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    }
    setSaving(false);
  };

  // Group fields by section
  const sectionMap = new Map<string, { id: string; name: string; fields: any[] }>();
  for (const f of orderedFieldsOnly) {
    const sectionId = f.sectionId || '__unsectioned';
    if (!sectionMap.has(sectionId)) {
      sectionMap.set(sectionId, { id: sectionId, name: sectionId === '__unsectioned' ? 'General' : sectionId, fields: [] });
    }
    sectionMap.get(sectionId)!.fields.push(f);
  }
  const sectionGroups = Array.from(sectionMap.values());

  return (
    <div className="page-enter">
      <button className="btn btn-ghost" onClick={onCancel} style={{ gap: 6, marginBottom: 16 }}>
        <ArrowLeft size={15} /> Back to Terms
      </button>

      <div className="card" style={{ padding: 24, maxWidth: 600 }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 16 }}>Add Term</h2>

        {error && <div style={{ padding: '8px 12px', background: '#fef2f2', borderRadius: 6, color: '#991b1b', fontSize: '0.85rem', marginBottom: 12 }}>{error}</div>}

        {fields.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <p style={{ color: '#9ca3af', marginBottom: 12 }}>No fields defined yet for Terms.</p>
            <p style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Go to Schema Builder to create fields first.</p>
          </div>
        ) : sectionGroups.length > 0 && sectionGroups[0].fields.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {sectionGroups.map(section => (
              section.fields.length > 0 && (
                <div key={section.id}>
                  {sectionGroups.length > 1 && (
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#6b7280', marginBottom: 8 }}>{section.name}</h3>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                    {section.fields.map((field: any) => (
                      <div key={field.id}>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, color: '#6b7280', marginBottom: 4 }}>
                          {field.name} {field.isRequired && <span style={{ color: '#dc2626' }}>*</span>}
                        </label>
                        <DynamicField
                          field={field}
                          value={values[field.internalName]}
                          onChange={(v) => handleChange(field.internalName, v)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )
            ))}
          </div>
        ) : (
          <p style={{ color: '#9ca3af' }}>No fields available.</p>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving || fields.length === 0}>
            {saving ? <ASSpinner size="sm" /> : <Plus size={14} />}
            Create Term
          </button>
        </div>
      </div>
    </div>
  );
}
