import { useMemo, useState, type ReactNode } from 'react';
import {
  BadgeCheck, Check, ClipboardList, Copy, Mail, Pencil, Phone, Plus, ShieldCheck, Store, X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Booth, EventRecord, FormField, Registration, RegistrationStatus } from '@/lib/types';
import { isContentField } from '@/components/form-renderer/fieldZod';
import { getSignedUrl } from '@/lib/storage';
import { boothList } from '@/lib/regBooths';
import { formatDateTime } from '@/lib/utils';
import { storedAcks } from '@/components/policies/policyAcks';
import { useToast } from '@/context/ToastContext';
import { Badge, Button } from '@/components/ui/basics';
import { Field, Input, Select } from '@/components/ui/inputs';
import { Modal } from '@/components/ui/overlays';
import { AnswerEditor } from './AnswerEditor';
import { AnswerView, isWideAnswer } from './AnswerView';

const statusTone: Record<RegistrationStatus, 'blue' | 'green' | 'amber' | 'red' | 'gray'> = {
  pending: 'blue', confirmed: 'green', waitlist: 'amber', rejected: 'red', cancelled: 'gray',
};

interface AnswerGroup { title: string | null; fields: FormField[] }

/**
 * Rebuild the shape the vendor actually saw: the form's own headings and
 * dividers become the groups, so a long registration reads as sections
 * instead of one undifferentiated list of forty questions.
 */
function groupFields(schema: FormField[]): AnswerGroup[] {
  const groups: AnswerGroup[] = [];
  let current: AnswerGroup = { title: null, fields: [] };
  const flush = () => { if (current.fields.length > 0) groups.push(current); };

  for (const f of schema) {
    if (f.type === 'heading') {
      flush();
      current = { title: f.content || f.label, fields: [] };
    } else if (f.type === 'divider') {
      flush();
      current = { title: f.content || null, fields: [] };
    } else if (!isContentField(f)) {
      current.fields.push(f);
    }
  }
  flush();
  return groups;
}

type Panel = 'summary' | 'answers' | 'agreements';

export function RegistrationModal({ event, registration, availableBooths, onClose, onSaved }: {
  event: EventRecord;
  registration: Registration;
  availableBooths: Booth[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [reg, setReg] = useState<Registration>(() => JSON.parse(JSON.stringify(registration)) as Registration);
  const [saving, setSaving] = useState(false);
  const [assignBooth, setAssignBooth] = useState('');
  const [panel, setPanel] = useState<Panel>('summary');
  const [editing, setEditing] = useState(false);

  const groups = useMemo(() => groupFields(event.form_schema), [event.form_schema]);
  const questionCount = useMemo(
    () => event.form_schema.filter((f) => !isContentField(f)).length,
    [event.form_schema]
  );
  const acks = useMemo(() => storedAcks(registration.data), [registration]);

  const heldBoothIds = useMemo(
    () => (registration.registration_booths ?? [])
      .map((rb) => rb.booth_id)
      .filter((id): id is string => !!id),
    [registration]
  );
  const heldBooths = boothList(registration);
  const maxBooths = Math.max(1, event.settings.maxBooths || 1);

  /** The public label configured for booked booths, taken from this registration's answers. */
  function bookedLabel(): string | null {
    const fieldId = event.floor_plan.bookedLabelField;
    if (!fieldId) return null;
    const v = registration.data?.[fieldId];
    return typeof v === 'string' && v.trim() ? v.trim().slice(0, 60) : null;
  }

  function setData(fieldId: string, value: unknown) {
    setReg((r) => ({ ...r, data: { ...r.data, [fieldId]: value } }));
  }

  function copy(text: string, what: string) {
    const clip = navigator.clipboard;
    if (!clip) { toast('Copying is not available in this browser.', 'error'); return; }
    void clip.writeText(text)
      .then(() => toast(`${what} copied.`))
      .catch(() => toast('Could not copy to the clipboard.', 'error'));
  }

  async function openFile(path: string) {
    try {
      const url = await getSignedUrl(path);
      window.open(url, '_blank');
    } catch {
      toast('Could not open the file.', 'error');
    }
  }

  function cancelEdits() {
    setReg(JSON.parse(JSON.stringify(registration)) as Registration);
    setEditing(false);
  }

  async function save() {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('registrations')
        .update({ name: reg.name, email: reg.email, phone: reg.phone, status: reg.status, data: reg.data })
        .eq('id', reg.id);
      if (error) throw error;
      toast('Registration updated.');
      onSaved();
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Save failed.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function releaseAll() {
    try {
      const { error } = await supabase.rpc('admin_release_registration_booths', { p_reg_id: reg.id });
      if (error) throw error;
      toast('All booths released.');
      onSaved();
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not release the booths.', 'error');
    }
  }

  async function releaseOne(boothId: string) {
    try {
      await supabase.from('registration_booths').delete().eq('registration_id', reg.id).eq('booth_id', boothId);
      await supabase.from('booths').update({ status: 'available', booked_label: null }).eq('id', boothId);
      const remaining = heldBoothIds.filter((id) => id !== boothId);
      await supabase.from('registrations').update({ booth_id: remaining[0] ?? null }).eq('id', reg.id);
      toast('Booth released.');
      onSaved();
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not release the booth.', 'error');
    }
  }

  async function assignToBooth() {
    if (!assignBooth) return;
    try {
      const { error } = await supabase
        .from('registration_booths')
        .insert({ registration_id: reg.id, booth_id: assignBooth });
      if (error) throw error;
      await supabase.from('booths').update({ status: 'booked', booked_label: bookedLabel() }).eq('id', assignBooth);
      if (!registration.booth_id) {
        await supabase.from('registrations').update({ booth_id: assignBooth }).eq('id', reg.id);
      }
      toast('Booth assigned.');
      onSaved();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      toast(msg.includes('one_holder_per_booth') ? 'That booth was just taken.' : msg || 'Could not assign the booth.', 'error');
    }
  }

  async function duplicate() {
    try {
      const { data: ref, error: refErr } = await supabase.rpc('generate_reference');
      if (refErr) throw refErr;
      const { error } = await supabase.from('registrations').insert({
        event_id: reg.event_id,
        reference: ref as unknown as string,
        booth_id: null,
        status: reg.status,
        name: reg.name, email: reg.email, phone: reg.phone,
        data: reg.data,
      });
      if (error) throw error;
      toast('Registration duplicated.');
      onSaved();
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Duplicate failed.', 'error');
    }
  }

  const panels: Array<{ id: Panel; label: string; icon: ReactNode; count?: number }> = [
    { id: 'summary', label: 'Summary', icon: <ClipboardList className="h-3.5 w-3.5" /> },
    { id: 'answers', label: 'Answers', icon: <Pencil className="h-3.5 w-3.5" />, count: questionCount },
    { id: 'agreements', label: 'Agreements', icon: <ShieldCheck className="h-3.5 w-3.5" />, count: acks.length },
  ];

  return (
    <Modal
      open onClose={onClose} title={`Registration ${reg.reference}`} wide
      footer={
        editing ? (
          <>
            <Button variant="ghost" onClick={cancelEdits}>Discard changes</Button>
            <Button icon={<Check className="h-4 w-4" />} onClick={() => void save()} loading={saving}>Save changes</Button>
          </>
        ) : (
          <>
            <Button variant="outline" icon={<Copy className="h-3.5 w-3.5" />} onClick={() => void duplicate()}>Duplicate</Button>
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>Edit</Button>
          </>
        )
      }
    >
      {/* ---- Identity strip: who this is, at a glance ---- */}
      <div className="sticky top-0 z-10 -mx-5 -mt-4 mb-4 border-b border-slate-100 bg-gradient-to-br from-navy-50 to-white px-5 pb-4 pt-4">
        <div className="flex flex-wrap items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-navy-700 font-display text-base font-bold text-white shadow-sm">
            {(reg.name ?? '?').trim().charAt(0).toUpperCase() || '?'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg font-bold leading-tight text-navy-800">
              {reg.name || 'Unnamed registrant'}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => copy(reg.reference, 'Reference')}
                title="Copy reference"
                className="inline-flex items-center gap-1 rounded-md bg-white px-1.5 py-0.5 font-mono text-[11px] font-semibold text-navy-700 ring-1 ring-slate-200 transition hover:ring-navy-300"
              >
                {reg.reference}<Copy className="h-3 w-3 opacity-50" />
              </button>
              <Badge color={statusTone[reg.status]} className="capitalize">{reg.status}</Badge>
              {reg.checked_in_at && (
                <Badge color="navy"><BadgeCheck className="h-3 w-3" /> Checked in</Badge>
              )}
              <span className="text-xs text-slate-400">Submitted {formatDateTime(reg.created_at)}</span>
            </div>
          </div>
          <div className="flex shrink-0 gap-1.5">
            {reg.email && (
              <a
                href={`mailto:${reg.email}`}
                title={reg.email}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white text-navy-600 ring-1 ring-slate-200 transition hover:bg-navy-50 hover:ring-navy-300"
              >
                <Mail className="h-4 w-4" />
              </a>
            )}
            {reg.phone && (
              <a
                href={`tel:${reg.phone.replace(/\s+/g, '')}`}
                title={reg.phone}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white text-navy-600 ring-1 ring-slate-200 transition hover:bg-navy-50 hover:ring-navy-300"
              >
                <Phone className="h-4 w-4" />
              </a>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1">
          {panels.map((p) => (
            <button
              key={p.id}
              onClick={() => setPanel(p.id)}
              aria-current={panel === p.id}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                panel === p.id ? 'bg-navy-700 text-white shadow-sm' : 'text-slate-500 hover:bg-white hover:text-navy-700'
              }`}
            >
              {p.icon}{p.label}
              {p.count !== undefined && (
                <span className={`rounded px-1 text-[10px] tabular-nums ${panel === p.id ? 'bg-white/20' : 'bg-slate-200 text-slate-600'}`}>
                  {p.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ---- Summary ---- */}
      {panel === 'summary' && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Status">
              <Select
                value={reg.status}
                onChange={(e) => { setReg({ ...reg, status: e.target.value as RegistrationStatus }); setEditing(true); }}
                aria-label="Registration status"
              >
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="waitlist">Waitlist</option>
                <option value="rejected">Rejected</option>
                <option value="cancelled">Cancelled</option>
              </Select>
            </Field>

            <Field label={`Booths (${heldBooths.length} of ${maxBooths})`}>
              <div className="space-y-2">
                {heldBooths.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {heldBooths.map((b, i) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded-full bg-navy-50 px-2.5 py-1 text-xs font-medium text-navy-700 ring-1 ring-navy-100">
                        <Store className="h-3 w-3" />
                        {b.label} {b.number && `(${b.number})`}
                        {heldBoothIds[i] && (
                          <button
                            aria-label={`Release booth ${b.label}`}
                            onClick={() => void releaseOne(heldBoothIds[i])}
                            className="text-navy-400 transition hover:text-red-500"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </span>
                    ))}
                    <Button size="sm" variant="ghost" className="text-red-500" onClick={() => void releaseAll()}>Release all</Button>
                  </div>
                )}
                {heldBooths.length < maxBooths && (
                  <div className="flex items-center gap-2">
                    <Select value={assignBooth} onChange={(e) => setAssignBooth(e.target.value)} aria-label="Assign booth">
                      <option value="">Choose a booth…</option>
                      {availableBooths.map((b) => (
                        <option key={b.id} value={b.id}>{b.label} {b.number && `(No. ${b.number})`}</option>
                      ))}
                    </Select>
                    <Button size="sm" variant="outline" icon={<Plus className="h-3.5 w-3.5" />} disabled={!assignBooth} onClick={() => void assignToBooth()}>Assign</Button>
                  </div>
                )}
                {heldBooths.length === 0 && maxBooths > 0 && (
                  <p className="text-xs text-slate-400">No booth assigned yet.</p>
                )}
              </div>
            </Field>
          </div>

          <div className="rounded-2xl border border-slate-200 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Contact details</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Name">
                <Input value={reg.name ?? ''} onChange={(e) => { setReg({ ...reg, name: e.target.value }); setEditing(true); }} />
              </Field>
              <Field label="Email">
                <Input type="email" value={reg.email ?? ''} onChange={(e) => { setReg({ ...reg, email: e.target.value }); setEditing(true); }} />
              </Field>
              <Field label="Phone">
                <Input value={reg.phone ?? ''} onChange={(e) => { setReg({ ...reg, phone: e.target.value }); setEditing(true); }} />
              </Field>
            </div>
          </div>

          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="flex items-baseline justify-between gap-3 rounded-xl bg-slate-50 px-3.5 py-2">
              <dt className="text-xs font-medium text-slate-500">Submitted</dt>
              <dd className="font-medium text-slate-700">{formatDateTime(reg.created_at)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 rounded-xl bg-slate-50 px-3.5 py-2">
              <dt className="text-xs font-medium text-slate-500">Checked in</dt>
              <dd className="font-medium text-slate-700">{reg.checked_in_at ? formatDateTime(reg.checked_in_at) : 'Not yet'}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 rounded-xl bg-slate-50 px-3.5 py-2">
              <dt className="text-xs font-medium text-slate-500">Confirmation email</dt>
              <dd className="font-medium text-slate-700">{reg.email_sent_at ? formatDateTime(reg.email_sent_at) : 'Not sent'}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 rounded-xl bg-slate-50 px-3.5 py-2">
              <dt className="text-xs font-medium text-slate-500">Agreements accepted</dt>
              <dd className="font-medium text-slate-700">{acks.length > 0 ? `${acks.length} on file` : 'None recorded'}</dd>
            </div>
          </dl>
        </div>
      )}

      {/* ---- Answers ---- */}
      {panel === 'answers' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              {editing ? 'Editing answers. Nothing is saved until you press Save changes.' : 'Read only. Press Edit to change an answer.'}
            </p>
            {!editing && (
              <Button size="sm" variant="outline" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(true)}>Edit</Button>
            )}
          </div>

          {groups.length === 0 && <p className="text-sm text-slate-500">This event has no form questions.</p>}

          {groups.map((g, gi) => (
            <section key={gi} className="space-y-3">
              {g.title && (
                <h3 className="flex items-center gap-2 text-sm font-semibold text-navy-800">
                  <span className="h-4 w-1 rounded-full bg-gold-400" aria-hidden="true" />
                  {g.title}
                </h3>
              )}
              {editing ? (
                <div className="space-y-3">
                  {g.fields.map((f) => (
                    <AnswerEditor
                      key={f.id}
                      field={f}
                      value={reg.data?.[f.id]}
                      onChange={(v) => setData(f.id, v)}
                      onOpenFile={(path) => void openFile(path)}
                    />
                  ))}
                </div>
              ) : (
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {g.fields.map((f) => (
                    <div key={f.id} className={isWideAnswer(f, reg.data?.[f.id]) ? 'sm:col-span-2' : ''}>
                      <AnswerView field={f} value={reg.data?.[f.id]} onOpenFile={(path) => void openFile(path)} />
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {/* ---- Agreements ---- */}
      {panel === 'agreements' && (
        <div className="space-y-3">
          {acks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-5 py-10 text-center">
              <ShieldCheck className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-medium text-slate-600">No individual agreements recorded</p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">
                This registration was submitted before per-section agreements were switched on, or the event asks for
                none. New registrations record every tick box the vendor accepted.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {acks.map((a, i) => (
                <li key={`${a.id}-${i}`} className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 px-3.5 py-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{a.title}</p>
                    <p className="text-sm text-slate-700">{a.text}</p>
                    {a.accepted_at && (
                      <p className="mt-0.5 text-xs text-slate-400">Accepted {formatDateTime(a.accepted_at)}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}
