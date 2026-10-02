/** Small, deliberately restricted rich-text language shared by editor and renderer. */
export function escapeHtml(value: string): string {
  return String(value).replace(/&(?!(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[\da-f]+);)/gi, '&amp;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const tags = new Set(['p', 'div', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'span', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'a']);
export function safeColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(value) ? value : fallback;
}
function safeStyle(raw: string): string {
  return raw.split(';').flatMap(part => {
    const at = part.indexOf(':');
    const key = part.slice(0, at).trim().toLowerCase();
    let value = part.slice(at + 1).trim();
    // Browsers serialize colors to rgb() and quote multiword font families.
    const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i.exec(value);
    if (rgb && rgb.slice(1).every(v => Number(v) <= 255)) value = '#' + rgb.slice(1).map(v => Number(v).toString(16).padStart(2, '0')).join('');
    if (['color', 'background-color'].includes(key) && safeColor(value, '')) return [`${key}:${value}`];
    if (key === 'font-family' && /^[a-zA-Z ,"'-]+$/.test(value)) return [`${key}:${value}`];
    if (key === 'font-size' && /^(?:[89]|[1-6]\d|7[0-2])px$/.test(value)) return [`${key}:${value}`];
    if (key === 'text-align' && /^(left|center|right)$/.test(value)) return [`${key}:${value}`];
    if (key === 'white-space' && value === 'nowrap') return ['white-space:nowrap'];
    if (key === 'font-weight' && /^(bold|[4-8]00)$/.test(value)) return [`${key}:${value}`];
    if (key === 'font-style' && value === 'italic') return ['font-style:italic'];
    if (key === 'text-decoration' && /^(underline|line-through)$/.test(value)) return [`${key}:${value}`];
    return [];
  }).join(';');
}

/** Rebuild allowed tags; attributes are never copied without validation. */
export function richToHtml(content: string, inline = false): string {
  const hasBlocks = /<(p|div|ul|ol|li|h[2-4]|br)\b/i.test(content || '');
  const tokens = String(content || '').match(/<[^>]*>|[^<]+|</g) || [];
  return tokens.map(token => {
    if (!token.startsWith('<')) return escapeHtml(token).replace(/\n/g, hasBlocks ? '\n' : '<br/>');
    const match = /^<(\/)?([a-z][a-z0-9]*)\b([^>]*)>$/i.exec(token);
    if (!match || !tags.has(match[2].toLowerCase())) return escapeHtml(token);
    const closing = !!match[1], tag = match[2].toLowerCase();
    if (inline && ['p', 'div', 'h2', 'h3', 'h4', 'li', 'ul', 'ol'].includes(tag)) {
      return closing ? '<br/>' : '';
    }
    if (closing) return tag === 'br' ? '' : `</${tag}>`;
    if (tag === 'br') return '<br/>';
    const attrs: Record<string, string> = {};
    for (const attr of match[3].matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[attr[1].toLowerCase()] = (attr[2] ?? attr[3]).replace(/&quot;|&#34;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
    const style = safeStyle(attrs.style || '');
    const styleAttr = style ? ` style="${escapeHtml(style)}"` : '';
    if (tag === 'a') {
      const href = attrs.href || '';
      return /^(https?:\/\/|mailto:|tel:)/i.test(href) && !/[\s<>"']/.test(href)
        ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"${styleAttr}>` : `<a${styleAttr}>`;
    }
    return `<${tag}${styleAttr}>`;
  }).join('').replace(inline ? /(?:<br\/>)+$/g : /$^/g, '');
}

export function plainText(content: string): string {
  return richToHtml(content).replace(/<br\s*\/?\s*>|<\/(?:p|div|li|h[2-4])>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').trim();
}
