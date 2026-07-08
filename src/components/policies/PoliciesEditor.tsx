import { useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import type { PolicySection } from '@/lib/types';
import { uid } from '@/lib/utils';
import { Button, Card, EmptyState } from '@/components/ui/basics';
import { Field, Input, Switch } from '@/components/ui/inputs';
import { RichTextArea } from '@/components/ui/RichTextArea';
import { ImageUpload } from '@/components/ui/ImageUpload';

const suggestions = [
  'Rules', 'Terms and Conditions', 'Health and Safety', 'Safeguarding', 'Food Regulations',
  'Parking Information', 'Setup Instructions', 'Cleanup Instructions', 'Emergency Information',
];

export function PoliciesEditor({ policies, onChange, prefix }: {
  policies: PolicySection[];
  onChange: (p: PolicySection[]) => void;
  prefix: string;
}) {
  const [openId, setOpenId] = useState<string | null>(policies[0]?.id ?? null);

  function add(title = 'New section') {
    const section: PolicySection = { id: uid(), title, content: '', enabled: true };
    onChange([...policies, section]);
    setOpenId(section.id);
  }
  function patch(id: string, p: Partial<PolicySection>) {
    onChange(policies.map((s) => (s.id === id ? { ...s, ...p } : s)));
  }
  function remove(id: string) {
    onChange(policies.filter((s) => s.id !== id));
  }
  function move(id: string, dir: -1 | 1) {
    const i = policies.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= policies.length) return;
    const next = [...policies];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  return (
    <Card
      title="Policy sections"
      actions={<Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => add()}>Add section</Button>}
    >
      <div className="mb-4 flex flex-wrap gap-1.5">
        {suggestions
          .filter((s) => !policies.some((p) => p.title === s))
          .map((s) => (
            <button
              key={s}
              onClick={() => add(s)}
              className="rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs text-slate-500 hover:border-navy-300 hover:text-navy-600"
            >
              + {s}
            </button>
          ))}
      </div>

      {policies.length === 0 ? (
        <EmptyState title="No policy sections yet" hint="Add sections such as Rules, Health and Safety or Parking Information." />
      ) : (
        <ul className="space-y-2">
          {policies.map((p, i) => (
            <li key={p.id} className="rounded-xl border border-slate-200">
              <div className="flex items-center gap-2 px-3 py-2">
                <button
                  className="flex-1 truncate text-left text-sm font-medium text-slate-700"
                  onClick={() => setOpenId(openId === p.id ? null : p.id)}
                  aria-expanded={openId === p.id}
                >
                  {p.title || 'Untitled section'}
                  {!p.enabled && <span className="ml-2 text-xs font-normal text-slate-400">(hidden)</span>}
                </button>
                <button aria-label="Move up" disabled={i === 0} onClick={() => move(p.id, -1)} className="rounded p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
                <button aria-label="Move down" disabled={i === policies.length - 1} onClick={() => move(p.id, 1)} className="rounded p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
                <button aria-label="Delete section" onClick={() => remove(p.id)} className="rounded p-1 text-red-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
              </div>
              {openId === p.id && (
                <div className="space-y-3 border-t border-slate-100 p-3">
                  <Field label="Section title">
                    <Input value={p.title} onChange={(e) => patch(p.id, { title: e.target.value })} />
                  </Field>
                  <RichTextArea
                    label="Content"
                    rows={6}
                    value={p.content}
                    onChange={(content) => patch(p.id, { content })}
                  />
                  <ImageUpload
                    label="Infographic image (optional)"
                    value={p.image_url}
                    onChange={(image_url) => patch(p.id, { image_url })}
                    prefix={`${prefix}/policies`}
                    hint="Shown full width inside this section, e.g. artwork from the graphic team."
                  />
                  <Switch checked={p.enabled} onChange={(enabled) => patch(p.id, { enabled })} label="Show this section on the registration page" />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
