// Pure SVG Chart Components — bar, line, pie, donut
// Larger size, readable text, no external library

import { useMemo } from 'react';
import { CHART_PALETTE } from '../lib/widgets';

interface ChartDataPoint {
  label: string;
  value: number;
  color?: string;
}

interface BaseProps {
  data: ChartDataPoint[];
  colors?: string[];
  height?: number;
}

// ─── Bar Chart ───────────────────────────────────────────────

export function BarChart({ data, colors = CHART_PALETTE, height = 220 }: BaseProps) {
  const maxVal = useMemo(() => Math.max(...data.map(d => d.value), 1), [data]);
  const barW = Math.min(48, Math.max(24, 320 / Math.max(data.length, 1)));

  return (
    <svg viewBox="0 0 340 260" style={{ width: '100%', height }}>
      {data.map((d, i) => {
        const barH = (d.value / maxVal) * 180;
        const x = 30 + i * (300 / Math.max(data.length, 1));
        const color = d.color || colors[i % colors.length];
        return (
          <g key={i}>
            <rect x={x} y={220 - barH} width={barW} height={barH} rx={4} fill={color} opacity={0.85}>
              <animate attributeName="height" from="0" to={barH} dur="0.6s" fill="freeze" />
              <animate attributeName="y" from="220" to={220 - barH} dur="0.6s" fill="freeze" />
            </rect>
            <text x={x + barW / 2} y={238} textAnchor="middle" fontSize="11" fill="#6b7280" fontFamily="Inter, sans-serif">
              {d.label.length > 10 ? d.label.slice(0, 9) + '…' : d.label}
            </text>
            <text x={x + barW / 2} y={215 - barH} textAnchor="middle" fontSize="11" fontWeight="600" fill={color} fontFamily="Inter, sans-serif">
              {d.value}
            </text>
          </g>
        );
      })}
      <line x1="25" y1="220" x2="335" y2="220" stroke="#e5e7eb" strokeWidth="1" />
    </svg>
  );
}

// ─── Line Chart ──────────────────────────────────────────────

export function LineChart({ data, colors = CHART_PALETTE, height = 220 }: BaseProps) {
  const maxVal = useMemo(() => Math.max(...data.map(d => d.value), 1), [data]);
  const minVal = useMemo(() => Math.min(...data.map(d => d.value), 0), [data]);
  const range = maxVal - minVal || 1;

  const points = data.map((d, i) => {
    const x = 30 + (i / Math.max(data.length - 1, 1)) * 280;
    const y = 210 - ((d.value - minVal) / range) * 170;
    return { x, y, ...d };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = pathD + ` L ${points[points.length - 1]?.x || 30} 210 L 30 210 Z`;
  const color = colors[0];

  return (
    <svg viewBox="0 0 340 260" style={{ width: '100%', height }}>
      <defs>
        <linearGradient id={`lg-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#lg-${color.replace('#', '')})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="4" fill="#fff" stroke={color} strokeWidth="2.5" />
          <text x={p.x} y={230} textAnchor="middle" fontSize="11" fill="#6b7280" fontFamily="Inter, sans-serif">
            {p.label.length > 8 ? p.label.slice(0, 7) + '…' : p.label}
          </text>
        </g>
      ))}
      <line x1="25" y1="220" x2="335" y2="220" stroke="#e5e7eb" strokeWidth="1" />
    </svg>
  );
}

// ─── Pie Chart ───────────────────────────────────────────────

export function PieChart({ data, colors = CHART_PALETTE, height = 220 }: BaseProps) {
  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0) || 1, [data]);
  const cx = 100, cy = 110, r = 85;

  const slices = useMemo(() => {
    let startAngle = -Math.PI / 2;
    return data.map((d, i) => {
      const angle = (d.value / total) * Math.PI * 2;
      const endAngle = startAngle + angle;
      const largeArc = angle > Math.PI ? 1 : 0;
      const x1 = cx + r * Math.cos(startAngle);
      const y1 = cy + r * Math.sin(startAngle);
      const x2 = cx + r * Math.cos(endAngle);
      const y2 = cy + r * Math.sin(endAngle);
      const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
      startAngle = endAngle;
      return { path, color: d.color || colors[i % colors.length], label: d.label, value: d.value };
    });
  }, [data, total, colors]);

  return (
    <svg viewBox="0 0 340 240" style={{ width: '100%', height }}>
      {slices.map((s, i) => (
        <path key={i} d={s.path} fill={s.color} opacity="0.85" stroke="#fff" strokeWidth="2">
          <animate attributeName="opacity" from="0" to="0.85" dur="0.5s" fill="freeze" />
        </path>
      ))}
      {slices.map((s, i) => (
        <g key={`l-${i}`} transform={`translate(220, ${30 + i * 24})`}>
          <rect width="12" height="12" rx="3" fill={s.color} />
          <text x="18" y="11" fontSize="11" fill="#374151" fontFamily="Inter, sans-serif">
            {s.label} ({s.value})
          </text>
        </g>
      ))}
    </svg>
  );
}

// ─── Donut Chart ─────────────────────────────────────────────

export function DonutChart({ data, colors = CHART_PALETTE, height = 220 }: BaseProps) {
  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0) || 1, [data]);
  const cx = 100, cy = 110, r = 75, inner = 48;

  const arcs = useMemo(() => {
    let startAngle = -Math.PI / 2;
    return data.map((d, i) => {
      const angle = (d.value / total) * Math.PI * 2;
      const endAngle = startAngle + angle;
      const largeArc = angle > Math.PI ? 1 : 0;
      const x1 = cx + r * Math.cos(startAngle);
      const y1 = cy + r * Math.sin(startAngle);
      const x2 = cx + r * Math.cos(endAngle);
      const y2 = cy + r * Math.sin(endAngle);
      const ix1 = cx + inner * Math.cos(startAngle);
      const iy1 = cy + inner * Math.sin(startAngle);
      const ix2 = cx + inner * Math.cos(endAngle);
      const iy2 = cy + inner * Math.sin(endAngle);
      const path = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${inner} ${inner} 0 ${largeArc} 0 ${ix1} ${iy1} Z`;
      startAngle = endAngle;
      return { path, color: d.color || colors[i % colors.length], label: d.label, value: d.value };
    });
  }, [data, total, colors]);

  return (
    <svg viewBox="0 0 340 240" style={{ width: '100%', height }}>
      {arcs.map((a, i) => (
        <path key={i} d={a.path} fill={a.color} opacity="0.85" stroke="#fff" strokeWidth="2">
          <animate attributeName="opacity" from="0" to="0.85" dur="0.5s" fill="freeze" />
        </path>
      ))}
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="20" fontWeight="700" fill="#111827" fontFamily="Inter, sans-serif">
        {total.toLocaleString()}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize="11" fill="#9ca3af" fontFamily="Inter, sans-serif">
        total
      </text>
      {arcs.map((a, i) => (
        <g key={`l-${i}`} transform={`translate(220, ${30 + i * 24})`}>
          <rect width="12" height="12" rx="3" fill={a.color} />
          <text x="18" y="11" fontSize="11" fill="#374151" fontFamily="Inter, sans-serif">
            {a.label} ({a.value})
          </text>
        </g>
      ))}
    </svg>
  );
}
