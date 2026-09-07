import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff, Lock, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import type { PolicySection } from '@/lib/types';
import { uid } from '@/lib/utils';
import { defaultSectionAckText } from '@/lib/defaults';
import { Button, Card, EmptyState } from '@/components/ui/basics';
import { Field, Input, Switch } from '@/components/ui/inputs';
import { RichTextArea } from '@/components/ui/RichTextArea';
import { ImageUpload } from '@/components/ui/ImageUpload';

const suggestions = [
  'Rules', 'Terms and Conditions', 'Health and Safety', 'Safeguarding', 'Food Regulations',
  'Parking Information', 'Setup Instructions', 'Cleanup Instructions', 'Emergency Information',
];

/** Small status pill used on the collapsed row so the setup reads at a glance. */
function Tag({ tone, icon, children }: {
  tone: 'navy' | 'gold' | 'slate';
  icon?: ReactNode;
  children: ReactNode;
}) {
  const tones = {
    navy: 'bg-navy-50 text-navy-700 ring-navy-100',
    gold: 'bg-gold-50 text-gold-800 ring-gold-100',
    slate: 'bg-slate-100 text-slate-500 ring-slate-200',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${tones[tone]}`}>
      {icon}{children}
    </span>
  );
}

export function PoliciesEditor({ policies, onChange, prefix }: {
  policies: PolicySection[];
  onChange: (p: PolicySection[]) => void;
  prefix: string;
}) {
  const [openId, setOpenId] = useState<string | null>(policies[0]?.id ?? null);

  function add(title = 'New section') {
    // New sections ask for their own tick by default: that is the whole point
    // of splitting policies up, and it is one switch away if it is not wanted.
    const section: PolicySection = {
      id: uid(), title, content: '', enabled: true,
      requireAck: true, requireRead: true, ackText: '',
    };
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

  const shown = policies.filter((p) => p.enabled);
  const ackCount = shown.filter((p) => p.requireAck).length;

  return (
    <Card
      title="Policy sections"
      actions={<Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => add()}>Add section</Button>}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5 ring-1 ring-slate-100">
        <ShieldCheck className="h-4 w-4 shrink-0 text-navy-500" />
        <p className="text-xs text-slate-600">
          <strong className="font-semibold text-navy-800">{shown.length}</strong> section{shown.length === 1 ? '' : 's'} shown on the
          registration page, <strong className="font-semibold text-navy-800">{ackCount}</strong> with their own tick box.
          Each ticked agreement is saved with the registration.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {suggestions
          .filter((s) => !policies.some((p) => p.title === s))
          .map((s) => (
            <button
              key={s}
              onClick={() => add(s)}
              className="rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs text-slate-500 transition hover:border-navy-300 hover:bg-navy-50/50 hover:text-navy-600"
            >
              + {s}
            </button>
          ))}
      </div>

      {policies.length === 0 ? (
        <EmptyState title="No policy sections yet" hint="Add sections such as Rules, Health and Safety or Parking Information." />
      ) : (
        <ul className="space-y-2.5">
          {policies.map((p, i) => {
            const open = openId === p.id;
            return (
              <li
                key={p.id}
                className={`overflow-hidden rounded-xl border transition ${open ? 'border-navy-300 bg-white shadow-card' : 'border-slate-200 bg-white hover:border-slate-300'}`}
              >
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[11px] font-bold tabular-nums text-slate-500">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <button
                    className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-left"
                    onClick={() => setOpenId(open ? null : p.id)}
                    aria-expanded={open}
                  >
                    <span className="truncate text-sm font-semibold text-slate-800">{p.title || 'Untitled section'}</span>
                    {p.requireAck && <Tag tone="navy" icon={<ShieldCheck className="h-3 w-3" />}>Agreement</Tag>}
                    {p.requireAck && p.requireRead !== false && <Tag tone="gold" icon={<Lock className="h-3 w-3" />}>Read first</Tag>}
                    {!p.enabled && <Tag tone="slate" icon={<EyeOff className="h-3 w-3" />}>Hidden</Tag>}
                  </button>
                  <button aria-label="Move up" disabled={i === 0} onClick={() => move(p.id, -1)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-25 disabled:hover:bg-transparent"><ChevronUp className="h-4 w-4" /></button>
                  <button aria-label="Move down" disabled={i === policies.length - 1} onClick={() => move(p.id, 1)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-25 disabled:hover:bg-transparent"><ChevronDown className="h-4 w-4" /></button>
                  <button aria-label="Delete section" onClick={() => remove(p.id)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                  <button
                    aria-label={open ? 'Collapse section' : 'Expand section'}
                    onClick={() => setOpenId(open ? null : p.id)}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                  >
                    <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                {open && (
                  <div className="space-y-4 border-t border-slate-100 bg-slate-50/50 p-4">
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

                    {/* Per-section agreement */}
                    <div className="rounded-xl border border-navy-100 bg-white p-3.5">
                      <Switch
                        checked={!!p.requireAck}
                        onChange={(requireAck) => patch(p.id, { requireAck })}
                        label="Ask for a separate agreement tick"
                        description="This section gets its own tick box, and the vendor cannot submit until it is ticked."
                      />
                      {p.requireAck && (
                        <div className="mt-3.5 space-y-3.5 border-t border-slate-100 pt-3.5">
                          <Field
                            label="Agreement wording"
                            hint="The sentence shown next to this section's tick box."
                          >
                            <Input
                              value={p.ackText ?? ''}
                              placeholder={defaultSectionAckText}
                              onChange={(e) => patch(p.id, { ackText: e.target.value })}
                            />
                          </Field>
                          <Switch
                            checked={p.requireRead !== false}
                            onChange={(requireRead) => patch(p.id, { requireRead })}
                            label="Unlock the tick box only after the section is read"
                            description="The vendor must open the section and scroll to the end. Short sections unlock straight away."
                          />
                        </div>
                      )}
                    </div>

                    <Switch
                      checked={p.enabled}
                      onChange={(enabled) => patch(p.id, { enabled })}
                      label="Show this section on the registration page"
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {policies.length > 0 && (
        <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-400">
          <Eye className="h-3.5 w-3.5" /> Vendors see these in this order. Use the arrows to reorder.
        </p>
      )}
    </Card>
  );
}
