import { Briefcase, Users, FileText, Plus } from 'lucide-react';

export default function Staff() {
  return (
    <div className="page-enter">
      <div className="entity-header">
        <div className="entity-header-left">
          <div className="entity-icon-wrap" style={{ background: '#f59e0b12' }}>
            <Briefcase size={22} style={{ color: '#f59e0b' }} />
          </div>
          <div>
            <h2>Staff</h2>
            <p className="text-muted">Employee records, contracts, and HR management</p>
          </div>
        </div>
        <div className="entity-header-actions">
          <button className="btn btn-primary"><Plus size={15} /> Add Staff</button>
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        {[
          { label: 'Total Staff', value: '0', icon: Users, color: '#f59e0b', bg: '#fffbeb' },
          { label: 'Teaching', value: '0', icon: Briefcase, color: '#3b82f6', bg: '#eff6ff' },
          { label: 'Non-Teaching', value: '0', icon: Users, color: '#a855f7', bg: '#faf5ff' },
          { label: 'Contracts Due', value: '0', icon: FileText, color: '#ef4444', bg: '#fef2f2' },
        ].map((kpi, i) => (
          <div key={kpi.label} className="kpi-card" style={{ animationDelay: `${i * 60}ms`, animation: 'fadeSlideUp 0.4s ease forwards', opacity: 0 }}>
            <div className="kpi-icon" style={{ background: kpi.bg }}><kpi.icon size={20} style={{ color: kpi.color }} /></div>
            <div><div className="kpi-value">{kpi.value}</div><div className="kpi-label">{kpi.label}</div></div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 20 }}>
        <div className="empty-state" style={{ padding: 40 }}>
          <div className="empty-state-icon" style={{ background: '#f59e0b12' }}><Briefcase size={28} style={{ color: '#f59e0b' }} /></div>
          <h3>No staff records</h3>
          <p>Add staff members to manage employee profiles and contracts.</p>
          <button className="btn btn-primary"><Plus size={15} /> Add Staff Member</button>
        </div>
      </div>
    </div>
  );
}
