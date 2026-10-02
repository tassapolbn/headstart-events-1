import { useEffect, useRef, useState } from 'react';
import { Bold, Italic, List, ListOrdered, Underline } from 'lucide-react';
import { fontOptions } from '@/lib/defaults';
import { escapeHtml, richToHtml } from '@/lib/richText';
import { ensureContentFonts, ensureFont } from '@/lib/fonts';
export { richToHtml } from '@/lib/richText';

/** Visual editing keeps the stored HTML compatible with existing event content. */
export function RichTextArea({ value, onChange, rows = 6, label, hint, id, inline = false }: {
  value: string; onChange: (v: string) => void; rows?: number; label?: string;
  hint?: string; id?: string; inline?: boolean;
}) {
  const editor = useRef<HTMLDivElement>(null);
  const selection = useRef<Range | null>(null);
  const emitted = useRef<string | null>(null);
  const [source, setSource] = useState(false);
  const [color, setColor] = useState('#1a3c5e');
  useEffect(() => {
    ensureContentFonts(value);
    if (editor.current && value !== emitted.current) editor.current.innerHTML = richToHtml(value);
  }, [value, source]);
  function remember() {
    const s = window.getSelection();
    if (s?.rangeCount && editor.current?.contains(s.anchorNode) && editor.current.contains(s.focusNode)) selection.current = s.getRangeAt(0).cloneRange();
  }
  useEffect(() => {
    document.addEventListener('selectionchange', remember);
    return () => document.removeEventListener('selectionchange', remember);
  }, []);
  function restore() {
    const el = editor.current;
    if (!el) return;
    el.focus();
    const s = window.getSelection();
    const range = selection.current;
    if (range && el.contains(range.commonAncestorContainer)) { s?.removeAllRanges(); s?.addRange(range); }
  }
  function publish() {
    const html = richToHtml(editor.current?.innerHTML ?? '');
    emitted.current = html;
    onChange(html === '<br/>' ? '' : html);
    remember();
  }
  function command(name: string, argument?: string) {
    restore();
    document.execCommand(name, false, argument);
    publish();
  }
  function wrap(style: string) {
    restore();
    const s = window.getSelection();
    if (!s?.rangeCount || s.getRangeAt(0).collapsed) return;
    const holder = document.createElement('div');
    holder.appendChild(s.getRangeAt(0).cloneContents());
    command('insertHTML', `<span style="${escapeHtml(style)}">${richToHtml(holder.innerHTML)}</span>`);
  }
  const button = 'rounded px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-navy-300';
  return <div className="space-y-1.5">
    {label && <span className="block text-sm font-medium text-slate-700">{label}</span>}
    <div className="overflow-hidden rounded-lg border border-slate-300 bg-white">
      {!source && <div className="flex flex-wrap items-center gap-1 border-b border-slate-100 p-1.5" role="toolbar" aria-label={`${label || 'Text'} formatting`}>
        {([{ name: 'bold', title: 'Bold', icon: Bold }, { name: 'italic', title: 'Italic', icon: Italic }, { name: 'underline', title: 'Underline', icon: Underline },
          ...(!inline ? [{ name: 'insertUnorderedList', title: 'Bullet list', icon: List }, { name: 'insertOrderedList', title: 'Numbered list', icon: ListOrdered }] : [])]).map(item =>
          <button key={item.name} type="button" className={button} aria-label={item.title} title={item.title} onMouseDown={e => e.preventDefault()} onClick={() => command(item.name)}><item.icon className="h-4 w-4" /></button>)}
        <label className="flex items-center gap-1 text-xs text-slate-600">Text color
          <input type="color" aria-label="Selected text color" value={color} className="h-7 w-8" onMouseDown={remember}
            onChange={e => setColor(e.target.value)} />
        </label>
        <button type="button" className={button} onMouseDown={e => e.preventDefault()} onClick={() => wrap(`color:${color}`)}>Apply color</button>
        <select aria-label="Selected text font" className="max-w-32 rounded border p-1 text-xs" value="" onMouseDown={remember}
          onChange={e => { ensureFont(e.target.value); wrap(`font-family:${e.target.value}, sans-serif`); }}>
          <option value="" disabled>Font…</option>{fontOptions.map(font => <option key={font}>{font}</option>)}
        </select>
        {!inline && <select aria-label="Text style" className="rounded border p-1 text-xs" value="" onMouseDown={remember} onChange={e => command('formatBlock', e.target.value)}>
          <option value="" disabled>Text style…</option><option value="p">Paragraph</option><option value="h2">Heading</option><option value="h3">Subheading</option>
        </select>}
        <button type="button" className={button} onMouseDown={e => e.preventDefault()} onClick={() => command('insertHTML', '<br>')}>Line break</button>
        <button type="button" className={button} title="Select a phrase to keep its words on one line" onMouseDown={e => e.preventDefault()} onClick={() => wrap('white-space:nowrap')}>Keep words together</button>
        {!inline && <select aria-label="Paragraph alignment" className="rounded border p-1 text-xs" value="" onMouseDown={remember} onChange={e => command(e.target.value)}>
          <option value="" disabled>Align…</option><option value="justifyLeft">Left</option><option value="justifyCenter">Center</option><option value="justifyRight">Right</option>
        </select>}
        <button type="button" className={button} onMouseDown={e => e.preventDefault()} onClick={() => {
          const address = window.prompt('Link address (https://…)');
          if (address && /^(https?:\/\/|mailto:|tel:)/i.test(address.trim())) command('createLink', address.trim());
        }}>Link</button>
        <button type="button" className={button} onMouseDown={e => e.preventDefault()} onClick={() => command('removeFormat')}>Clear format</button>
      </div>}
      {source ? <textarea id={id} rows={rows} value={value} onChange={e => onChange(e.target.value)} aria-label={label || 'Rich text content'} className="w-full p-3 font-mono text-sm" />
        : <div ref={editor} id={id} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label={label || 'Rich text content'}
          className="ev-rich min-w-0 overflow-x-auto px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-inset focus:ring-navy-200"
          style={{ minHeight: Math.max(56, rows * 24) }} onInput={publish} onMouseUp={remember} onKeyUp={remember}
          onPaste={e => { e.preventDefault(); command('insertHTML', escapeHtml(e.clipboardData.getData('text/plain')).replace(/\n/g, '<br/>')); }}
          onKeyDown={e => { if (e.key === 'Enter' && inline) { e.preventDefault(); command('insertHTML', '<br>'); } }} />}
    </div>
    <div className="flex items-start justify-between gap-2 text-xs text-slate-500">
      <p>{hint || 'Select words to change their color or font. Use Line break to choose where a new line begins.'}</p>
      <button type="button" className="shrink-0 underline" onClick={() => { emitted.current = null; setSource(!source); }}>{source ? 'Visual editor' : 'HTML'}</button>
    </div>
  </div>;
}
