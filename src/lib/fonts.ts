const loaded = new Set<string>(['Inter']);

const FAMILY_URL: Record<string, string> = {
  Inter: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  Nunito: 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700&display=swap',
  Outfit: 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap',
  Roboto: 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap',
};

/** Load a non-critical font on demand (non-blocking). Safe to call repeatedly. */
export function ensureFontLoaded(family: string): void {
  if (!family || loaded.has(family)) return;
  const href = FAMILY_URL[family];
  if (!href) return;
  loaded.add(family);
  try {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.media = 'print';
    link.onload = () => {
      link.media = 'all';
    };
    document.head.appendChild(link);
    // Fallback in case onload never fires
    setTimeout(() => {
      link.media = 'all';
    }, 2000);
  } catch {
    /* ignore */
  }
}

export function applyFontFamily(family: string): void {
  if (!family) return;
  ensureFontLoaded(family);
  document.body.style.fontFamily = `'${family}', system-ui, -apple-system, sans-serif`;
  try {
    localStorage.setItem('font', family);
  } catch {
    /* ignore */
  }
}
