import { useState, useEffect } from 'react';

export interface SchoolTheme {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  bgColor: string;
  sidebarBg: string;
  textColor: string;
  borderRadius: number;
  fontFamily: string;
}

const DEFAULT_THEME: SchoolTheme = {
  primaryColor: '#16a34a',
  secondaryColor: '#15803d',
  accentColor: '#22c55e',
  bgColor: '#fafbfc',
  sidebarBg: '#111827',
  textColor: '#111827',
  borderRadius: 10,
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
};

const PRESETS: Array<{ name: string; theme: Partial<SchoolTheme> }> = [
  { name: 'Forest Green', theme: { primaryColor: '#16a34a', secondaryColor: '#15803d', accentColor: '#22c55e', sidebarBg: '#111827' } },
  { name: 'Ocean Blue', theme: { primaryColor: '#0ea5e9', secondaryColor: '#0369a1', accentColor: '#06b6d4', sidebarBg: '#0c4a6e' } },
  { name: 'Royal Purple', theme: { primaryColor: '#a855f7', secondaryColor: '#7e22ce', accentColor: '#ec4899', sidebarBg: '#3b0764' } },
  { name: 'Sunset Orange', theme: { primaryColor: '#f97316', secondaryColor: '#c2410c', accentColor: '#eab308', sidebarBg: '#7c2d12' } },
  { name: 'Midnight', theme: { primaryColor: '#6366f1', secondaryColor: '#4338ca', accentColor: '#f43f5e', sidebarBg: '#1e1b4b', bgColor: '#0f172a', textColor: '#e2e8f0' } },
  { name: 'Rose Gold', theme: { primaryColor: '#f43f5e', secondaryColor: '#be123c', accentColor: '#fb923c', sidebarBg: '#881337' } },
  { name: 'Clean White', theme: { primaryColor: '#2563eb', secondaryColor: '#1d4ed8', accentColor: '#16a34a', sidebarBg: '#1e293b' } },
  { name: 'Crimson', theme: { primaryColor: '#dc2626', secondaryColor: '#991b1b', accentColor: '#2563eb', sidebarBg: '#7f1d1d' } },
];

const FONT_OPTIONS = [
  'Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  'SF Pro Display, Inter, system-ui, sans-serif',
  'Poppins, sans-serif',
  'Roboto, sans-serif',
  'Open Sans, sans-serif',
  'Lato, sans-serif',
  'Nunito, sans-serif',
  'Source Sans Pro, sans-serif',
];

const RADIUS_OPTIONS = [0, 4, 6, 8, 10, 12, 14, 16, 20];

export function useSchoolTheme() {
  const [theme, setTheme] = useState<SchoolTheme>(() => {
    try {
      const saved = localStorage.getItem('anyschool_theme');
      return saved ? { ...DEFAULT_THEME, ...JSON.parse(saved) } : DEFAULT_THEME;
    } catch { return DEFAULT_THEME; }
  });

  useEffect(() => {
    localStorage.setItem('anyschool_theme', JSON.stringify(theme));
    applyTheme(theme);
  }, [theme]);

  return {
    theme,
    setTheme,
    updateTheme: (partial: Partial<SchoolTheme>) => setTheme(t => ({ ...t, ...partial })),
    resetTheme: () => { setTheme(DEFAULT_THEME); localStorage.removeItem('anyschool_theme'); },
  };
}

function applyTheme(t: SchoolTheme) {
  const root = document.documentElement;
  root.style.setProperty('--brand-primary', t.primaryColor);
  root.style.setProperty('--brand-primary-hover', t.secondaryColor);
  root.style.setProperty('--brand-primary-light', t.primaryColor + '12');
  root.style.setProperty('--brand-primary-medium', t.primaryColor + '20');
  root.style.setProperty('--brand-accent', t.accentColor);
  root.style.setProperty('--brand-accent-light', t.accentColor + '15');
  root.style.setProperty('--brand-bg', t.bgColor);
  root.style.setProperty('--brand-sidebar', t.sidebarBg);
  root.style.setProperty('--brand-text', t.textColor);
  root.style.setProperty('--brand-radius', t.borderRadius + 'px');
  root.style.setProperty('--brand-font', t.fontFamily);
}

export { DEFAULT_THEME, PRESETS, FONT_OPTIONS, RADIUS_OPTIONS };
