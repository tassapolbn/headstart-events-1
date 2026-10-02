const loaded = new Set<string>();

const fontUrls: Record<string, string> = {
  Sarabun: 'https://fonts.googleapis.com/css2?family=Sarabun:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,700&display=swap',
  Inter: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
  Poppins: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap',
  Nunito: 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap',
  'Playfair Display': 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700;800&display=swap',
  Merriweather: 'https://fonts.googleapis.com/css2?family=Merriweather:wght@400;700;900&display=swap',
  Quicksand: 'https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap',
};

/** Load a Google Font once, on demand, for themed public pages. */
export function ensureFont(family: string) {
  if (typeof document === 'undefined') return;
  if (loaded.has(family) || !fontUrls[family]) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = fontUrls[family];
  document.head.appendChild(link);
  loaded.add(family);
}

export function ensureContentFonts(content: string) {
  Object.keys(fontUrls).filter(font => content.includes(font)).forEach(ensureFont);
}
