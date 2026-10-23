import { useState } from 'react';
import { Palette, Type, Sparkles, RotateCcw } from 'lucide-react';
import { SchoolTheme, PRESETS, FONT_OPTIONS, RADIUS_OPTIONS } from '../lib/theme';

interface Props {
  theme: SchoolTheme;
  onUpdate: (partial: Partial<SchoolTheme>) => void;
  onReset: () => void;
}

export default function ThemeCustomizer({ theme, onUpdate, onReset }: Props) {
  const [tab, setTab] = useState<'colors' | 'typography' | 'presets'>('colors');

  return (
    <div className="page-enter theme-page">
      <div className="theme-header">
        <div>
          <h2>Theme Customizer</h2>
          <p className="text-muted">Customize the look and feel of your school's portal</p>
        </div>
        <button className="btn btn-ghost" onClick={onReset}>
          <RotateCcw size={14} />
          Reset
        </button>
      </div>

      <div className="theme-tabs">
        <button className={`theme-tab ${tab === 'colors' ? 'active' : ''}`} onClick={() => setTab('colors')}>
          <Palette size={15} />
          Colors
        </button>
        <button className={`theme-tab ${tab === 'typography' ? 'active' : ''}`} onClick={() => setTab('typography')}>
          <Type size={15} />
          Typography
        </button>
        <button className={`theme-tab ${tab === 'presets' ? 'active' : ''}`} onClick={() => setTab('presets')}>
          <Sparkles size={15} />
          Presets
        </button>
      </div>

      {tab === 'colors' && (
        <div className="theme-content">
          <div className="color-grid">
            <ColorPicker label="Primary" value={theme.primaryColor} onChange={v => onUpdate({ primaryColor: v })} />
            <ColorPicker label="Secondary" value={theme.secondaryColor} onChange={v => onUpdate({ secondaryColor: v })} />
            <ColorPicker label="Accent" value={theme.accentColor} onChange={v => onUpdate({ accentColor: v })} />
            <ColorPicker label="Background" value={theme.bgColor} onChange={v => onUpdate({ bgColor: v })} />
            <ColorPicker label="Sidebar" value={theme.sidebarBg} onChange={v => onUpdate({ sidebarBg: v })} />
            <ColorPicker label="Text" value={theme.textColor} onChange={v => onUpdate({ textColor: v })} />
          </div>

          <div className="theme-preview card" style={{ padding: 0, overflow: 'hidden', marginTop: 24 }}>
            <div style={{ display: 'flex', height: 240 }}>
              <div style={{ width: 200, background: theme.sidebarBg, padding: 16, color: '#e5e7eb' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: theme.primaryColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700 }}>AS</div>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>AnySchool</span>
                </div>
                {['Dashboard', 'Learners', 'Classes'].map((item, i) => (
                  <div key={item} style={{
                    padding: '6px 10px', borderRadius: 6, marginBottom: 4, fontSize: '0.75rem',
                    background: i === 0 ? theme.primaryColor : 'transparent',
                    color: i === 0 ? '#fff' : '#9ca3af',
                    fontWeight: i === 0 ? 600 : 400,
                  }}>{item}</div>
                ))}
              </div>
              <div style={{ flex: 1, background: theme.bgColor, padding: 16 }}>
                <div style={{ borderBottom: `2px solid ${theme.accentColor}`, paddingBottom: 8, marginBottom: 12, fontSize: '0.85rem', fontWeight: 600, color: theme.textColor }}>Dashboard</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[
                    { color: theme.primaryColor, label: 'Learners', value: '247' },
                    { color: theme.accentColor, label: 'Classes', value: '18' },
                  ].map(card => (
                    <div key={card.label} style={{ flex: 1, padding: 10, borderLeft: `3px solid ${card.color}`, background: '#fff', borderRadius: 6 }}>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: card.color }}>{card.value}</div>
                      <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>{card.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'typography' && (
        <div className="theme-content">
          <div className="card" style={{ padding: 20 }}>
            <div className="form-group">
              <label className="form-label">Font Family</label>
              <select className="select" value={theme.fontFamily} onChange={e => onUpdate({ fontFamily: e.target.value })}>
                {FONT_OPTIONS.map(f => <option key={f} value={f}>{f.split(',')[0]}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Border Radius: {theme.borderRadius}px</label>
              <input
                type="range"
                min="0"
                max="24"
                value={theme.borderRadius}
                onChange={e => onUpdate({ borderRadius: Number(e.target.value) })}
                style={{ width: '100%', accentColor: 'var(--brand-primary)' }}
              />
              <div className="radius-options">
                {RADIUS_OPTIONS.map(r => (
                  <button
                    key={r}
                    className={`radius-btn ${theme.borderRadius === r ? 'active' : ''}`}
                    onClick={() => onUpdate({ borderRadius: r })}
                  >
                    {r}px
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 20, marginTop: 16 }}>
            <label className="form-label" style={{ marginBottom: 12 }}>Preview</label>
            <div style={{ fontFamily: theme.fontFamily }}>
              <h4 style={{ color: theme.textColor, marginBottom: 4 }}>The quick brown fox jumps over the lazy dog</h4>
              <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789</p>
            </div>
          </div>
        </div>
      )}

      {tab === 'presets' && (
        <div className="theme-content">
          <p className="text-muted" style={{ marginBottom: 16 }}>Choose a starting point, then fine-tune to match your school's identity.</p>
          <div className="preset-grid">
            {PRESETS.map(preset => (
              <button key={preset.name} className="preset-card" onClick={() => onUpdate(preset.theme)}>
                <div className="preset-colors">
                  <span style={{ background: preset.theme.primaryColor || theme.primaryColor }} />
                  <span style={{ background: preset.theme.secondaryColor || theme.secondaryColor }} />
                  <span style={{ background: preset.theme.accentColor || theme.accentColor }} />
                  <span style={{ background: preset.theme.sidebarBg || theme.sidebarBg }} />
                </div>
                <span className="preset-name">{preset.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="color-picker">
      <label className="form-label">{label}</label>
      <div className="color-input-row">
        <input type="color" value={value} onChange={e => onChange(e.target.value)} className="color-swatch" />
        <input type="text" value={value} onChange={e => onChange(e.target.value)} className="input color-hex" />
      </div>
    </div>
  );
}
