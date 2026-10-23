// Configurable KPI Card — type-aware, handles error/missing states

import { AlertTriangle, Users } from 'lucide-react';
import type { WidgetConfig } from '../lib/widgets';

const ICON_MAP: Record<string, any> = {
  users: Users,
};

interface Props {
  config: WidgetConfig;
  value: string | number;
  error?: string;
  fieldMissing?: boolean;
}

export default function KPICard({ config, value, error, fieldMissing }: Props) {
  if (config.hidden) return null;

  const Icon = config.icon ? ICON_MAP[config.icon] || Users : Users;

  // Field deleted / missing state
  if (fieldMissing) {
    return (
      <div className="kpi-card" style={{
        background: '#fef2f2',
        border: '1px solid #fecaca',
        animation: 'fadeSlideUp 0.4s ease forwards',
      }}>
        <div className="kpi-icon" style={{ background: '#fee2e2' }}>
          <AlertTriangle size={20} style={{ color: '#ef4444' }} />
        </div>
        <div>
          <div className="kpi-value" style={{ color: '#ef4444', fontSize: '0.85rem' }}>—</div>
          <div className="kpi-label">{config.title}</div>
          <div style={{ fontSize: '0.7rem', color: '#dc2626', marginTop: 2 }}>Field no longer available</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="kpi-card"
      style={{
        animation: 'fadeSlideUp 0.4s ease forwards',
        background: error ? '#fffbeb' : config.bgColor,
        border: error ? '1px solid #fde68a' : 'none',
      }}
    >
      <div className="kpi-icon" style={{ background: (error ? '#f59e0b' : config.color) + '18' }}>
        <Icon size={20} style={{ color: error ? '#f59e0b' : config.color }} />
      </div>
      <div>
        <div className="kpi-value" style={{ color: error ? '#f59e0b' : config.color }}>
          {config.prefix || ''}{typeof value === 'number' ? value.toLocaleString() : value}{config.suffix || ''}
        </div>
        <div className="kpi-label">{config.title}</div>
        {error && (
          <div style={{ fontSize: '0.7rem', color: '#b45309', marginTop: 2, maxWidth: 160 }}>{error}</div>
        )}
      </div>
    </div>
  );
}
