const ACCENT_CSS_VARS = ['--primary', '--ring', '--sidebar-primary', '--sidebar-ring'] as const;

export const LEGACY_DEFAULT_HEX = '#111827';
export const LEGACY_DEFAULT_HSL = '220 39% 11%';
export const DEFAULT_HEX = '#000000';
export const DEFAULT_HSL = '0 0% 0%';

export function applyAccentHsl(hsl: string) {
  const root = document.documentElement;
  ACCENT_CSS_VARS.forEach(v => root.style.setProperty(v, hsl));
}

export function applyAccentFromStorage() {
  const hsl = localStorage.getItem('accentHsl');
  if (hsl) applyAccentHsl(hsl);
}

export function normalizeAccent(hex?: string | null, hsl?: string | null): { hex: string; hsl: string } {
  const isLegacyDefault =
    (hsl || '').trim() === LEGACY_DEFAULT_HSL ||
    (hex || '').toUpperCase() === LEGACY_DEFAULT_HEX;
  if (isLegacyDefault) return { hex: DEFAULT_HEX, hsl: DEFAULT_HSL };
  return { hex: hex || DEFAULT_HEX, hsl: hsl || DEFAULT_HSL };
}