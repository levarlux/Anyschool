// School Branding System
// Doc 09 §4 — Per-school branding (logo, primary color)

export interface SchoolBranding {
  logo?: string; // URL to logo image
  primaryColor: string; // Hex color code
  primaryColorHover: string;
  primaryColorLight: string;
  favicon?: string; // URL to favicon
}

/**
 * Default branding
 */
export const defaultBranding: SchoolBranding = {
  primaryColor: '#2563eb', // Blue-600
  primaryColorHover: '#1d4ed8', // Blue-700
  primaryColorLight: '#dbeafe', // Blue-100
};

/**
 * Generate CSS custom properties for school branding
 */
export function generateBrandingCSS(branding: SchoolBranding): string {
  return `
    --school-primary-color: ${branding.primaryColor};
    --school-primary-hover: ${branding.primaryColorHover};
    --school-primary-light: ${branding.primaryColorLight};
    ${branding.logo ? `--school-logo: url('${branding.logo}');` : ''}
  `;
}

/**
 * Apply school branding to document root
 */
export function applySchoolBranding(branding: SchoolBranding): void {
  const root = document.documentElement;
  root.setAttribute('data-school-branding', 'true');
  root.style.setProperty('--school-primary-color', branding.primaryColor);
  root.style.setProperty('--school-primary-hover', branding.primaryColorHover);
  root.style.setProperty('--school-primary-light', branding.primaryColorLight);
}

/**
 * Generate color variants from a base color
 */
export function generateColorVariants(baseColor: string): {
  hover: string;
  light: string;
  dark: string;
} {
  // Convert hex to RGB
  const hex = baseColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Generate hover (darker)
  const hoverR = Math.max(0, r - 20);
  const hoverG = Math.max(0, g - 20);
  const hoverB = Math.max(0, b - 20);
  const hover = `#${hoverR.toString(16).padStart(2, '0')}${hoverG.toString(16).padStart(2, '0')}${hoverB.toString(16).padStart(2, '0')}`;

  // Generate light (lighter)
  const lightR = Math.min(255, r + 180);
  const lightG = Math.min(255, g + 180);
  const lightB = Math.min(255, b + 180);
  const light = `#${lightR.toString(16).padStart(2, '0')}${lightG.toString(16).padStart(2, '0')}${lightB.toString(16).padStart(2, '0')}`;

  // Generate dark (much darker)
  const darkR = Math.max(0, r - 100);
  const darkG = Math.max(0, g - 100);
  const darkB = Math.max(0, b - 100);
  const dark = `#${darkR.toString(16).padStart(2, '0')}${darkG.toString(16).padStart(2, '0')}${darkB.toString(16).padStart(2, '0')}`;

  return { hover, light, dark };
}

/**
 * Validate a hex color code
 */
export function isValidHexColor(color: string): boolean {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
}

/**
 * Branding component props interface
 */
export interface BrandingProviderProps {
  branding: SchoolBranding;
  children: React.ReactNode;
}

/**
 * React hook to get current school branding
 */
export function useSchoolBranding(): SchoolBranding {
  // In production, this would fetch from context/API
  // For now, return default branding
  return defaultBranding;
}