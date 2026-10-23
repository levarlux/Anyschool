import { MessageSquare, Send, Bell, Mail, Plus } from 'lucide-react';

export default function Communication() {
  return (
    <div className="page-enter">
      <div className="entity-header">
        <div className="entity-header-left">
          <div className="entity-icon-wrap" style={{ background: '#06b6d412' }}>
            <MessageSquare size={22} style={{ color: '#06b6d4' }} />
          </div>
          <div>
            <h2>Communication</h2>
            <p className="text-muted">Messages, announcements, and notifications</p>
          </div>
        </div>
        <div className="entity-header-actions">
          <button className="btn btn-primary"><Plus size={15} /> New Message</button>
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        {[
          { label: 'Messages Sent', value: '0', icon: Send, color: '#06b6d4', bg: '#ecfeff' },
          { label: 'Announcements', value: '0', icon: Bell, color: '#f59e0b', bg: '#fffbeb' },
          { label: 'Parent Contacts', value: '0', icon: Mail, color: '#a855f7', bg: '#faf5ff' },
          { label: 'Read Rate', value: '0%', icon: MessageSquare, color: '#22c55e', bg: '#f0fdf4' },
        ].map((kpi, i) => (
          <div key={kpi.label} className="kpi-card" style={{ animationDelay: `${i * 60}ms`, animation: 'fadeSlideUp 0.4s ease forwards', opacity: 0 }}>
            <div className="kpi-icon" style={{ background: kpi.bg }}><kpi.icon size={20} style={{ color: kpi.color }} /></div>
            <div><div className="kpi-value">{kpi.value}</div><div className="kpi-label">{kpi.label}</div></div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 20 }}>
        <div className="empty-state" style={{ padding: 40 }}>
          <div className="empty-state-icon" style={{ background: '#06b6d412' }}><MessageSquare size={28} style={{ color: '#06b6d4' }} /></div>
          <h3>No messages yet</h3>
          <p>Send announcements, notifications, or messages to parents and staff.</p>
          <button className="btn btn-primary"><Plus size={15} /> Compose Message</button>
        </div>
      </div>
    </div>
  );
}
