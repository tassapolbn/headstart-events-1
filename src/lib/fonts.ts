const loaded = new Set<string>();

const fontUrls: Record<string, string> = {
  Inter: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
  Poppins: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap',
  Nunito: 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap',
  'Playfair Display': 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700;800&display=swap',
  Merriweather: 'https://fonts.googleapis.com/css2?family=Merriweather:wght@400;700;900&display=swap',
  Quicksand: 'https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap',
};

/** Load a Google Font once, on demand, for themed public pages. */
export function ensureFont(family: string) {
  if (loaded.has(family) || !fontUrls[family]) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = fontUrls[family];
  document.head.appendChild(link);
  loaded.add(family);
}
