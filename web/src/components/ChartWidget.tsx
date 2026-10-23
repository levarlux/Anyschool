// Chart Widget — type-aware, handles error/missing states, empty data

import { AlertTriangle } from 'lucide-react';
import { BarChart, LineChart, PieChart, DonutChart } from './Charts';
import type { WidgetConfig } from '../lib/widgets';
import { CHART_PALETTE } from '../lib/widgets';

interface Props {
  config: WidgetConfig;
  data: Array<{ label: string; value: number }>;
  error?: string;
  fieldMissing?: boolean;
}

export default function ChartWidget({ config, data, error, fieldMissing }: Props) {
  if (config.hidden) return null;

  const colors = config.chartColors || CHART_PALETTE;

  // Field deleted / missing state
  if (fieldMissing) {
    return (
      <div className="card chart-widget" style={{
        padding: 20,
        background: '#fef2f2',
        border: '1px solid #fecaca',
        animation: 'fadeSlideUp 0.4s ease forwards',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#dc2626' }}>{config.title}</h4>
        </div>
        <div style={{ padding: 24, textAlign: 'center' }}>
          <AlertTriangle size={24} style={{ color: '#ef4444', marginBottom: 8 }} />
          <p style={{ fontSize: '0.85rem', color: '#dc2626' }}>Field no longer available</p>
          <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: 4 }}>
            Delete this widget or reconfigure with a different field.
          </p>
        </div>
      </div>
    );
  }

  // Empty data state
  if (!data || data.length === 0) {
    return (
      <div className="card chart-widget" style={{
        padding: 20,
        animation: 'fadeSlideUp 0.4s ease forwards',
        background: config.bgColor,
        border: 'none',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-text)' }}>{config.title}</h4>
          <span style={{ fontSize: '0.7rem', color: 'var(--brand-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {config.chartType}
          </span>
        </div>
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--brand-text-tertiary)', fontSize: '0.85rem' }}>
          No data to display
        </div>
      </div>
    );
  }

  const renderChart = () => {
    switch (config.chartType) {
      case 'bar': return <BarChart data={data} colors={colors} height={220} />;
      case 'line': return <LineChart data={data} colors={colors} height={220} />;
      case 'pie': return <PieChart data={data} colors={colors} height={220} />;
      case 'donut': return <DonutChart data={data} colors={colors} height={220} />;
      default: return <BarChart data={data} colors={colors} height={220} />;
    }
  };

  return (
    <div
      className="card chart-widget"
      style={{
        padding: 20,
        animation: 'fadeSlideUp 0.4s ease forwards',
        background: error ? '#fffbeb' : config.bgColor,
        border: error ? '1px solid #fde68a' : 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: error ? '#b45309' : 'var(--brand-text)' }}>
          {config.title}
        </h4>
        <span style={{ fontSize: '0.7rem', color: error ? '#b45309' : 'var(--brand-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {config.chartType}
        </span>
      </div>
      {error && (
        <div style={{ fontSize: '0.75rem', color: '#b45309', marginBottom: 8, padding: '4px 8px', background: '#fef3c7', borderRadius: 4 }}>
          {error}
        </div>
      )}
      {renderChart()}
    </div>
  );
}
