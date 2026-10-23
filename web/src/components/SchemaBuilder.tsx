import { useState } from 'react';
import {
  Plus, Trash2, GripVertical, Type, Hash, Calendar, ChevronDown,
  ToggleLeft, Paperclip, Calculator, Sigma, ArrowUpDown,
} from 'lucide-react';

const FIELD_TYPES = [
  { type: 'text', label: 'Text', icon: Type, color: '#3b82f6' },
  { type: 'number', label: 'Number', icon: Hash, color: '#22c55e' },
  { type: 'date', label: 'Date', icon: Calendar, color: '#f59e0b' },
  { type: 'select', label: 'Select', icon: ChevronDown, color: '#a855f7' },
  { type: 'boolean', label: 'Boolean', icon: ToggleLeft, color: '#ec4899' },
  { type: 'file', label: 'File', icon: Paperclip, color: '#f97316' },
  { type: 'computed', label: 'Computed', icon: Calculator, color: '#06b6d4' },
  { type: 'rollup', label: 'Rollup', icon: Sigma, color: '#14b8a6' },
  { type: 'relation', label: 'Relation', icon: ArrowUpDown, color: '#8b5cf6' },
];

interface Field {
  id: string;
  name: string;
  type: string;
  required: boolean;
}

export default function SchemaBuilder() {
  const [entityName, setEntityName] = useState('');
  const [fields, setFields] = useState<Field[]>([]);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState('text');
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [entities, setEntities] = useState<Array<{ name: string; fields: Field[] }>>([]);

  const addField = () => {
    if (!newFieldName.trim()) return;
    const field: Field = {
      id: `field-${Date.now()}`,
      name: newFieldName,
      type: newFieldType,
      required: false,
    };
    setFields([...fields, field]);
    setNewFieldName('');
    setNewFieldType('text');
  };

  const removeField = (id: string) => {
    setFields(fields.filter(f => f.id !== id));
    if (selectedField === id) setSelectedField(null);
  };

  const updateField = (id: string, updates: Partial<Field>) => {
    setFields(fields.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const saveEntity = () => {
    if (!entityName.trim() || fields.length === 0) return;
    setEntities([...entities, { name: entityName, fields: [...fields] }]);
    setEntityName('');
    setFields([]);
  };

  const selected = fields.find(f => f.id === selectedField);

  return (
    <div className="page-enter schema-page">
      <div className="schema-header">
        <div>
          <h2>Schema Builder</h2>
          <p className="text-muted">Create custom entity types and define their fields</p>
        </div>
      </div>

      <div className="schema-layout">
        <div className="schema-main">
          <div className="card" style={{ padding: 20 }}>
            <div className="form-group">
              <label className="form-label">Entity Type Name</label>
              <input
                className="input"
                type="text"
                placeholder="e.g. Fee Structure, Discipline Record, Transport"
                value={entityName}
                onChange={e => setEntityName(e.target.value)}
              />
            </div>
          </div>

          <div className="card" style={{ padding: 20 }}>
            <div className="section-header" style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: '0.95rem' }}>Fields</h3>
              <span className="badge">{fields.length}</span>
            </div>

            <div className="field-add-row">
              <input
                className="input"
                type="text"
                placeholder="Field name (e.g. annual_fee, admission_date)"
                value={newFieldName}
                onChange={e => setNewFieldName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addField()}
              />
              <select
                className="select"
                value={newFieldType}
                onChange={e => setNewFieldType(e.target.value)}
                style={{ width: 160 }}
              >
                {FIELD_TYPES.map(ft => (
                  <option key={ft.type} value={ft.type}>{ft.label}</option>
                ))}
              </select>
              <button className="btn btn-primary" onClick={addField} disabled={!newFieldName.trim()}>
                <Plus size={15} />
                Add
              </button>
            </div>

            {fields.length === 0 ? (
              <div className="fields-empty">
                <p>No fields added yet. Choose a field type and start building your entity.</p>
                <div className="field-type-chips">
                  {FIELD_TYPES.map(ft => {
                    const Icon = ft.icon;
                    return (
                      <button
                        key={ft.type}
                        className={`field-chip ${newFieldType === ft.type ? 'active' : ''}`}
                        onClick={() => setNewFieldType(ft.type)}
                        style={newFieldType === ft.type ? { borderColor: ft.color, color: ft.color, background: ft.color + '08' } : undefined}
                      >
                        <Icon size={14} />
                        {ft.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="fields-list">
                {fields.map((field, i) => {
                  const ft = FIELD_TYPES.find(f => f.type === field.type);
                  const Icon = ft?.icon || Type;
                  return (
                    <div
                      key={field.id}
                      className={`field-item ${selectedField === field.id ? 'selected' : ''}`}
                      onClick={() => setSelectedField(field.id)}
                      style={{ animationDelay: `${i * 30}ms` }}
                    >
                      <GripVertical size={14} className="field-grip" />
                      <div className="field-icon" style={{ color: ft?.color }}>
                        <Icon size={15} />
                      </div>
                      <div className="field-info">
                        <span className="field-name">{field.name}</span>
                        <span className="field-type-badge" style={{ background: ft?.color + '12', color: ft?.color }}>{ft?.label}</span>
                      </div>
                      {field.required && <span className="badge badge-error" style={{ fontSize: '0.65rem' }}>Required</span>}
                      <button
                        className="btn btn-ghost btn-icon"
                        style={{ width: 28, height: 28, flexShrink: 0 }}
                        onClick={e => { e.stopPropagation(); removeField(field.id); }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {fields.length > 0 && (
            <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={saveEntity} disabled={!entityName.trim()}>
              Save Entity Type
            </button>
          )}
        </div>

        {selected && (
          <div className="schema-sidebar card" style={{ padding: 20, animation: 'slideInRight 0.2s ease' }}>
            <div className="section-header" style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: '0.95rem' }}>Field Properties</h3>
            </div>
            <div className="form-group">
              <label className="form-label">Field Name</label>
              <input
                className="input"
                value={selected.name}
                onChange={e => updateField(selected.id, { name: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Type</label>
              <select
                className="select"
                value={selected.type}
                onChange={e => updateField(selected.id, { type: e.target.value })}
              >
                {FIELD_TYPES.map(ft => (
                  <option key={ft.type} value={ft.type}>{ft.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.835rem' }}>
                <input
                  type="checkbox"
                  checked={selected.required}
                  onChange={() => updateField(selected.id, { required: !selected.required })}
                  style={{ width: 16, height: 16, accentColor: 'var(--brand-primary)' }}
                />
                Required field
              </label>
            </div>
          </div>
        )}
      </div>

      {entities.length > 0 && (
        <div className="card" style={{ padding: 20, marginTop: 24 }}>
          <div className="section-header" style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: '0.95rem' }}>Saved Entity Types</h3>
          </div>
          <div className="entities-list">
            {entities.map((ent, i) => (
              <div key={i} className="entity-chip">
                <span className="entity-chip-name">{ent.name}</span>
                <span className="badge">{ent.fields.length} fields</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
