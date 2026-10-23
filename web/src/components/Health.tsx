import { Heart, Activity, Stethoscope, Plus } from 'lucide-react';

export default function Health() {
  return (
    <div className="page-enter">
      <div className="entity-header">
        <div className="entity-header-left">
          <div className="entity-icon-wrap" style={{ background: '#ef444412' }}>
            <Heart size={22} style={{ color: '#ef4444' }} />
          </div>
          <div>
            <h2>Health</h2>
            <p className="text-muted">Student health records and medical information</p>
          </div>
        </div>
        <div className="entity-header-actions">
          <button className="btn btn-primary"><Plus size={15} /> Add Record</button>
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        {[
          { label: 'Health Records', value: '0', icon: Heart, color: '#ef4444', bg: '#fef2f2' },
          { label: 'Check-ups Due', value: '0', icon: Stethoscope, color: '#f59e0b', bg: '#fffbeb' },
          { label: 'Vaccinations', value: '0', icon: Activity, color: '#22c55e', bg: '#f0fdf4' },
          { label: 'Alerts', value: '0', icon: Heart, color: '#3b82f6', bg: '#eff6ff' },
        ].map((kpi, i) => (
          <div key={kpi.label} className="kpi-card" style={{ animationDelay: `${i * 60}ms`, animation: 'fadeSlideUp 0.4s ease forwards', opacity: 0 }}>
            <div className="kpi-icon" style={{ background: kpi.bg }}><kpi.icon size={20} style={{ color: kpi.color }} /></div>
            <div><div className="kpi-value">{kpi.value}</div><div className="kpi-label">{kpi.label}</div></div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 20 }}>
        <div className="empty-state" style={{ padding: 40 }}>
          <div className="empty-state-icon" style={{ background: '#ef444412' }}><Heart size={28} style={{ color: '#ef4444' }} /></div>
          <h3>No health records</h3>
          <p>Start by adding health profiles for your learners.</p>
          <button className="btn btn-primary"><Plus size={15} /> Add Health Record</button>
        </div>
      </div>
    </div>
  );
}
