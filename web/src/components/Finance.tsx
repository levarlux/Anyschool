import { Wallet, TrendingUp, DollarSign, CreditCard, PieChart } from 'lucide-react';

export default function Finance() {
  return (
    <div className="page-enter">
      <div className="entity-header">
        <div className="entity-header-left">
          <div className="entity-icon-wrap" style={{ background: '#22c55e12' }}>
            <Wallet size={22} style={{ color: '#22c55e' }} />
          </div>
          <div>
            <h2>Finance</h2>
            <p className="text-muted">Fees, payments, and financial reports</p>
          </div>
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        {[
          { label: 'Total Revenue', value: 'KES 2.4M', icon: TrendingUp, color: '#22c55e', bg: '#f0fdf4' },
          { label: 'Outstanding', value: 'KES 340K', icon: CreditCard, color: '#f59e0b', bg: '#fffbeb' },
          { label: 'Collection Rate', value: '87.5%', icon: PieChart, color: '#3b82f6', bg: '#eff6ff' },
          { label: 'This Month', value: 'KES 180K', icon: DollarSign, color: '#a855f7', bg: '#faf5ff' },
        ].map((kpi, i) => (
          <div key={kpi.label} className="kpi-card" style={{ animationDelay: `${i * 60}ms`, animation: 'fadeSlideUp 0.4s ease forwards', opacity: 0 }}>
            <div className="kpi-icon" style={{ background: kpi.bg }}>
              <kpi.icon size={20} style={{ color: kpi.color }} />
            </div>
            <div>
              <div className="kpi-value">{kpi.value}</div>
              <div className="kpi-label">{kpi.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 20 }}>
        <div className="section-header"><h3 style={{ fontSize: '0.95rem' }}>Recent Transactions</h3></div>
        <div className="empty-state" style={{ padding: 40 }}>
          <div className="empty-state-icon" style={{ background: '#22c55e12' }}>
            <Wallet size={28} style={{ color: '#22c55e' }} />
          </div>
          <h3>No transactions yet</h3>
          <p>Start by setting up fee structures and recording payments.</p>
          <button className="btn btn-primary">Set Up Fee Structure</button>
        </div>
      </div>
    </div>
  );
}
