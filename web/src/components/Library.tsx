import { Library as LibraryIcon, BookOpen, BookMarked, Plus } from 'lucide-react';

export default function Library() {
  return (
    <div className="page-enter">
      <div className="entity-header">
        <div className="entity-header-left">
          <div className="entity-icon-wrap" style={{ background: '#a855f712' }}>
            <LibraryIcon size={22} style={{ color: '#a855f7' }} />
          </div>
          <div>
            <h2>Library</h2>
            <p className="text-muted">Book catalog, borrowings, and inventory</p>
          </div>
        </div>
        <div className="entity-header-actions">
          <button className="btn btn-primary"><Plus size={15} /> Add Book</button>
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        {[
          { label: 'Total Books', value: '0', icon: BookOpen, color: '#a855f7', bg: '#faf5ff' },
          { label: 'On Loan', value: '0', icon: BookMarked, color: '#f59e0b', bg: '#fffbeb' },
          { label: 'Available', value: '0', icon: BookOpen, color: '#22c55e', bg: '#f0fdf4' },
          { label: 'Overdue', value: '0', icon: BookMarked, color: '#ef4444', bg: '#fef2f2' },
        ].map((kpi, i) => (
          <div key={kpi.label} className="kpi-card" style={{ animationDelay: `${i * 60}ms`, animation: 'fadeSlideUp 0.4s ease forwards', opacity: 0 }}>
            <div className="kpi-icon" style={{ background: kpi.bg }}><kpi.icon size={20} style={{ color: kpi.color }} /></div>
            <div><div className="kpi-value">{kpi.value}</div><div className="kpi-label">{kpi.label}</div></div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 20 }}>
        <div className="empty-state" style={{ padding: 40 }}>
          <div className="empty-state-icon" style={{ background: '#a855f712' }}><LibraryIcon size={28} style={{ color: '#a855f7' }} /></div>
          <h3>Library catalog is empty</h3>
          <p>Add books to start tracking borrowings and inventory.</p>
          <button className="btn btn-primary"><Plus size={15} /> Add First Book</button>
        </div>
      </div>
    </div>
  );
}
