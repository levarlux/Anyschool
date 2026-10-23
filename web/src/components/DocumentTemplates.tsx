import { useState } from 'react';
import { FileText, Plus, CreditCard, Award, Calendar, Mail, FileEdit } from 'lucide-react';

const TEMPLATE_TYPES = [
  { type: 'report_card', label: 'Report Card', icon: FileText, color: '#3b82f6' },
  { type: 'certificate', label: 'Certificate', icon: Award, color: '#22c55e' },
  { type: 'invoice', label: 'Invoice', icon: CreditCard, color: '#f59e0b' },
  { type: 'timetable', label: 'Timetable', icon: Calendar, color: '#a855f7' },
  { type: 'letter', label: 'Letter', icon: Mail, color: '#ef4444' },
  { type: 'custom', label: 'Custom', icon: FileEdit, color: '#6b7280' },
];

export default function DocumentTemplates() {
  const [templates] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);

  return (
    <div className="page-enter">
      <div className="entity-header">
        <div className="entity-header-left">
          <div className="entity-icon-wrap" style={{ background: '#16a34a12' }}>
            <FileText size={22} style={{ color: '#16a34a' }} />
          </div>
          <div>
            <h2>Document Templates</h2>
            <p className="text-muted">Create and manage report cards, certificates, invoices, and more</p>
          </div>
        </div>
        <div className="entity-header-actions">
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>
            <Plus size={15} />
            New Template
          </button>
        </div>
      </div>

      {showNew && (
        <div className="card page-enter" style={{ padding: 24, marginBottom: 20 }}>
          <h3 style={{ fontSize: '1rem', marginBottom: 16 }}>Create Template</h3>
          <div className="form-group">
            <label className="form-label">Template Name</label>
            <input className="input" placeholder="e.g. End of Term Report Card" />
          </div>
          <div className="form-group">
            <label className="form-label">Template Type</label>
            <div className="template-type-grid">
              {TEMPLATE_TYPES.map(t => {
                const Icon = t.icon;
                return (
                  <button key={t.type} className="template-type-btn">
                    <Icon size={18} style={{ color: t.color }} />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Entity Type</label>
            <select className="select">
              {['learner', 'class', 'subject', 'teacher', 'term', 'assessment', 'enrollment'].map(e => (
                <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setShowNew(false)}>Cancel</button>
            <button className="btn btn-primary">Create</button>
          </div>
        </div>
      )}

      {templates.length === 0 ? (
        <div className="card" style={{ padding: 20 }}>
          <div className="empty-state" style={{ padding: 40 }}>
            <div className="empty-state-icon" style={{ background: '#16a34a12' }}>
              <FileText size={28} style={{ color: '#16a34a' }} />
            </div>
            <h3>No templates yet</h3>
            <p>Create document templates for report cards, certificates, invoices, and more.</p>
            <div className="template-type-grid" style={{ marginTop: 16, maxWidth: 600 }}>
              {TEMPLATE_TYPES.map(t => {
                const Icon = t.icon;
                return (
                  <button key={t.type} className="template-type-btn" onClick={() => setShowNew(true)}>
                    <Icon size={18} style={{ color: t.color }} />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="templates-grid">
          {templates.map((t: any, i: number) => {
            const typeInfo = TEMPLATE_TYPES.find(tt => tt.type === t.type);
            const Icon = typeInfo?.icon || FileText;
            return (
              <div key={i} className="card card-hover card-clickable" style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div className="entity-icon-wrap" style={{ background: (typeInfo?.color || '#6b7280') + '12' }}>
                    <Icon size={18} style={{ color: typeInfo?.color || '#6b7280' }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{t.name}</div>
                    <div className="text-muted" style={{ fontSize: '0.75rem' }}>{typeInfo?.label}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-sm btn-secondary">Edit</button>
                  <button className="btn btn-sm btn-danger">Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
