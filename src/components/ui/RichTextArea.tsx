import { useRef, useState } from 'react';
import { Bold, Eye, EyeOff, Heading2, Italic, List, ListOrdered, Underline } from 'lucide-react';
import { fontOptions } from '@/lib/defaults';
import { cn } from '@/lib/utils';

/** Render stored rich content. Plain text keeps its line breaks. */
export function richToHtml(content: string): string {
  if (!content) return '';
  if (/<[a-z][\s\S]*>/i.test(content)) return content;
  return content
    .split('\n')
    .map((line) => (line.trim() === '' ? '<br/>' : `<p>${line}</p>`))
    .join('');
}

/**
 * A friendly rich text editor: bold, italic, underline, bullet points,
 * numbered lists, headings and font choice, with a live preview.
 * Content is stored as simple HTML.
 */
export function RichTextArea({ value, onChange, rows = 6, label, hint, id }: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  label?: string;
  hint?: string;
  id?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);

  function surround(before: string, after: string, placeholder = 'text') {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const selectedRaw = value.slice(start, end);
    const selected = selectedRaw || placeholder;
    const next = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  }

  function makeList(ordered: boolean) {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const selected = value.slice(start, end) || 'First item\nSecond item';
    const items = selected
      .split('\n')
      .map((s) => s.replace(/<\/?li>/g, '').trim())
      .filter(Boolean)
      .map((s) => `  <li>${s}</li>`)
      .join('\n');
    const tag = ordered ? 'ol' : 'ul';
    const block = `\n<${tag}>\n${items}\n</${tag}>\n`;
    onChange(value.slice(0, start) + block + value.slice(end));
  }

  const btn = 'rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-navy-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-300';

  return (
    <div className="space-y-1.5">
      {label && <span className="block text-sm font-medium text-slate-700">{label}</span>}
      <div className="rounded-lg border border-slate-300 bg-white">
        <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-100 px-1.5 py-1">
          <button type="button" title="Bold" aria-label="Bold" className={btn} onClick={() => surround('<strong>', '</strong>')}><Bold className="h-4 w-4" /></button>
          <button type="button" title="Italic" aria-label="Italic" className={btn} onClick={() => surround('<em>', '</em>')}><Italic className="h-4 w-4" /></button>
          <button type="button" title="Underline" aria-label="Underline" className={btn} onClick={() => surround('<u>', '</u>')}><Underline className="h-4 w-4" /></button>
          <button type="button" title="Heading" aria-label="Heading" className={btn} onClick={() => surround('\n<h3>', '</h3>\n', 'Heading')}><Heading2 className="h-4 w-4" /></button>
          <button type="button" title="Bullet points" aria-label="Bullet points" className={btn} onClick={() => makeList(false)}><List className="h-4 w-4" /></button>
          <button type="button" title="Numbered list" aria-label="Numbered list" className={btn} onClick={() => makeList(true)}><ListOrdered className="h-4 w-4" /></button>
          <select
            aria-label="Apply font to selection"
            className="ml-1 rounded border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-600"
            value=""
            onChange={(e) => {
              if (e.target.value) surround(`<span style="font-family:'${e.target.value}', sans-serif">`, '</span>');
              e.target.value = '';
            }}
          >
            <option value="" disabled>Font…</option>
            {fontOptions.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <button
            type="button"
            className={cn(btn, 'ml-auto flex items-center gap-1 text-xs font-medium')}
            onClick={() => setPreview(!preview)}
            aria-pressed={preview}
          >
            {preview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} {preview ? 'Edit' : 'Preview'}
          </button>
        </div>
        {preview ? (
          <div
            className="ev-rich min-h-[120px] px-3 py-2 text-sm text-slate-800"
            dangerouslySetInnerHTML={{ __html: richToHtml(value) }}
          />
        ) : (
          <textarea
            id={id}
            ref={ref}
            rows={rows}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full resize-y rounded-b-lg border-0 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-200"
            aria-label={label ?? 'Rich text content'}
          />
        )}
      </div>
      <p className="text-xs text-slate-500">{hint ?? 'Select text, then press a button to make it bold, a list, or a different font.'}</p>
    </div>
  );
}
