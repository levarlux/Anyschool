// Module Accent Colors & Icons Configuration
// Doc 09 §3 — Per-module visual identity

export interface ModuleAccent {
  name: string;
  internalName: string;
  color: string;
  colorLight: string;
  colorDark: string;
  icon: string;
}

/**
 * Default accent colors for core pillars and suggested modules
 */
export const moduleAccents: ModuleAccent[] = [
  // Core Pillars
  {
    name: 'Learner',
    internalName: 'learner',
    color: '#3b82f6',
    colorLight: '#dbeafe',
    colorDark: '#1e40af',
    icon: 'user',
  },
  {
    name: 'Class',
    internalName: 'class',
    color: '#10b981',
    colorLight: '#d1fae5',
    colorDark: '#065f46',
    icon: 'users',
  },
  {
    name: 'Subject',
    internalName: 'subject',
    color: '#8b5cf6',
    colorLight: '#ede9fe',
    colorDark: '#5b21b6',
    icon: 'book',
  },
  {
    name: 'Teacher',
    internalName: 'teacher',
    color: '#f59e0b',
    colorLight: '#fef3c7',
    colorDark: '#92400e',
    icon: 'briefcase',
  },
  {
    name: 'Term',
    internalName: 'term',
    color: '#ef4444',
    colorLight: '#fee2e2',
    colorDark: '#991b1b',
    icon: 'calendar',
  },
  {
    name: 'Assessment',
    internalName: 'assessment',
    color: '#ec4899',
    colorLight: '#fce7f3',
    colorDark: '#9d174d',
    icon: 'clipboard',
  },
  {
    name: 'Enrollment',
    internalName: 'enrollment',
    color: '#06b6d4',
    colorLight: '#cffafe',
    colorDark: '#155e75',
    icon: 'user-plus',
  },
  // Suggested Modules
  {
    name: 'Finance',
    internalName: 'finance',
    color: '#10b981',
    colorLight: '#d1fae5',
    colorDark: '#065f46',
    icon: 'dollar-sign',
  },
  {
    name: 'Library',
    internalName: 'library',
    color: '#8b5cf6',
    colorLight: '#ede9fe',
    colorDark: '#5b21b6',
    icon: 'book-open',
  },
  {
    name: 'HR',
    internalName: 'hr',
    color: '#f59e0b',
    colorLight: '#fef3c7',
    colorDark: '#92400e',
    icon: 'users',
  },
  {
    name: 'Health',
    internalName: 'health',
    color: '#ef4444',
    colorLight: '#fee2e2',
    colorDark: '#991b1b',
    icon: 'heart',
  },
  {
    name: 'Communication',
    internalName: 'communication',
    color: '#06b6d4',
    colorLight: '#cffafe',
    colorDark: '#155e75',
    icon: 'message-square',
  },
];

/**
 * Get accent color for a module by internal name
 */
export function getModuleAccent(internalName: string): ModuleAccent | undefined {
  return moduleAccents.find(a => a.internalName === internalName);
}

/**
 * Generate CSS custom properties for a module accent
 */
export function generateModuleAccentCSS(accent: ModuleAccent): string {
  return `
    --accent-${accent.internalName}: ${accent.color};
    --accent-${accent.internalName}-light: ${accent.colorLight};
    --accent-${accent.internalName}-dark: ${accent.colorDark};
  `;
}

/**
 * Generate all module accent CSS variables
 */
export function generateAllModuleAccentsCSS(): string {
  return moduleAccents.map(generateModuleAccentCSS).join('\n');
}

/**
 * Apply module accent to an element
 */
export function applyModuleAccent(
  element: HTMLElement,
  internalName: string
): void {
  const accent = getModuleAccent(internalName);
  if (accent) {
    element.style.setProperty('--current-accent', accent.color);
    element.style.setProperty('--current-accent-light', accent.colorLight);
    element.style.setProperty('--current-accent-dark', accent.colorDark);
  }
}

/**
 * Get contrasting text color for a background
 */
export function getContrastTextColor(backgroundColor: string): string {
  // Convert hex to RGB
  const hex = backgroundColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  // Return black or white based on luminance
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}