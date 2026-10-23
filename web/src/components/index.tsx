// Shared Component Library
// Doc 09 §2 — Craft lives in the block, not the page

import React from 'react';
import { getModuleAccent } from '../design-system/module-accents';

// Base Block Component
interface BlockProps {
  children: React.ReactNode;
  className?: string;
  accent?: string; // Module internal name for accent color
}

export const Block: React.FC<BlockProps> = ({ children, className = '', accent }) => {
  const accentStyle = accent ? {
    '--current-accent': getModuleAccent(accent)?.color,
    '--current-accent-light': getModuleAccent(accent)?.colorLight,
  } as React.CSSProperties : {};

  return (
    <div
      className={`block ${className}`}
      style={accentStyle}
    >
      {children}
    </div>
  );
};

// KPI Card Component
interface KPICardProps {
  label: string;
  value: number | string;
  unit?: string;
  trend?: number; // Percentage change
  accent?: string;
}

export const KPICard: React.FC<KPICardProps> = ({ label, value, unit, trend, accent }) => {
  const accentColor = accent ? getModuleAccent(accent)?.color : undefined;

  return (
    <div className="kpi-card" style={{ borderTopColor: accentColor }}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">
        {value}
        {unit && <span className="kpi-unit">{unit}</span>}
      </div>
      {trend !== undefined && (
        <div className={`kpi-trend ${trend >= 0 ? 'positive' : 'negative'}`}>
          {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
        </div>
      )}
    </div>
  );
};

// Status Badge Component
interface StatusBadgeProps {
  status: string;
  variant?: 'default' | 'success' | 'warning' | 'error';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, variant = 'default' }) => {
  const variantClass = `status-badge status-${variant}`;

  return (
    <span className={variantClass}>
      {status}
    </span>
  );
};

// Table Component
interface TableProps {
  columns: Array<{
    key: string;
    label: string;
    width?: string;
  }>;
  data: Array<Record<string, any>>;
  onRowClick?: (row: Record<string, any>) => void;
  accent?: string;
}

export const Table: React.FC<TableProps> = ({ columns, data, onRowClick, accent }) => {
  const accentColor = accent ? getModuleAccent(accent)?.color : undefined;

  return (
    <div className="table-container">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map(col => (
              <th
                key={col.key}
                style={{
                  width: col.width,
                  borderBottomColor: accentColor,
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr
              key={idx}
              onClick={() => onRowClick?.(row)}
              className={onRowClick ? 'clickable' : ''}
            >
              {columns.map(col => (
                <td key={col.key}>{row[col.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// Chart Container Component
interface ChartContainerProps {
  title: string;
  children: React.ReactNode;
  accent?: string;
}

export const ChartContainer: React.FC<ChartContainerProps> = ({ title, children, accent }) => {
  const accentColor = accent ? getModuleAccent(accent)?.color : undefined;

  return (
    <div className="chart-container">
      <h3 className="chart-title" style={{ borderBottomColor: accentColor }}>
        {title}
      </h3>
      <div className="chart-content">
        {children}
      </div>
    </div>
  );
};

// Button Component
interface ButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  onClick?: () => void;
  accent?: string;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  onClick,
  accent,
}) => {
  const accentColor = accent ? getModuleAccent(accent)?.color : undefined;

  const accentObj = accent ? getModuleAccent(accent) : undefined;
  const baseStyle = accentColor ? {
    '--button-accent': accentColor,
    '--button-accent-hover': accentObj?.colorDark || accentColor,
  } as React.CSSProperties : {};

  return (
    <button
      className={`btn btn-${variant} btn-${size}`}
      disabled={disabled}
      onClick={onClick}
      style={baseStyle}
    >
      {children}
    </button>
  );
};

// Input Component
interface InputProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'number' | 'email' | 'password';
  error?: string;
  accent?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  error,
  accent,
}) => {
  const accentColor = accent ? getModuleAccent(accent)?.color : undefined;

  return (
    <div className="input-group">
      {label && <label className="input-label">{label}</label>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`input ${error ? 'input-error' : ''}`}
        style={{ borderColor: accentColor }}
      />
      {error && <span className="input-error-text">{error}</span>}
    </div>
  );
};

// Select Component
interface SelectProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  accent?: string;
}

export const Select: React.FC<SelectProps> = ({
  label,
  value,
  onChange,
  options,
  placeholder,
  accent,
}) => {
  const accentColor = accent ? getModuleAccent(accent)?.color : undefined;

  return (
    <div className="input-group">
      {label && <label className="input-label">{label}</label>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="select"
        style={{ borderColor: accentColor }}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
};

// Modal Component
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  accent?: string;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, accent }) => {
  if (!isOpen) return null;

  const accentColor = accent ? getModuleAccent(accent)?.color : undefined;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ borderTopColor: accentColor }}
      >
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-content">
          {children}
        </div>
      </div>
    </div>
  );
};

// Sidebar Navigation Component
interface SidebarItemProps {
  icon: string;
  label: string;
  active?: boolean;
  accent?: string;
  onClick?: () => void;
}

export const SidebarItem: React.FC<SidebarItemProps> = ({
  icon,
  label,
  active = false,
  accent,
  onClick,
}) => {
  const accentColor = accent ? getModuleAccent(accent)?.color : undefined;

  return (
    <div
      className={`sidebar-item ${active ? 'active' : ''}`}
      onClick={onClick}
      style={active ? { borderLeftColor: accentColor } : undefined}
    >
      <span className="sidebar-icon">{icon}</span>
      <span className="sidebar-label">{label}</span>
    </div>
  );
};