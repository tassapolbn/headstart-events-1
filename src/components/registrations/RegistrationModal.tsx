import { useMemo, useState } from 'react';
import { Copy, ExternalLink, Plus, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Booth, EventRecord, Registration, RegistrationStatus } from '@/lib/types';
import { isContentField } from '@/components/form-renderer/fieldZod';
import { getSignedUrl, isStoredFileRef } from '@/lib/storage';
import { boothList } from '@/lib/regBooths';
import { useToast } from '@/context/ToastContext';
import { Button } from '@/components/ui/basics';
import { Field, Input, Select, Textarea } from '@/components/ui/inputs';
import { Modal } from '@/components/ui/overlays';

export function RegistrationModal({ event, registration, availableBooths, onClose, onSaved }: {
  event: EventRecord;
  registration: Registration;
  availableBooths: Booth[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [reg, setReg] = useState<Registration>(JSON.parse(JSON.stringify(registration)));
  const [saving, setSaving] = useState(false);
  const [assignBooth, setAssignBooth] = useState('');

  const questionFields = event.form_schema.filter((f) => !isContentField(f));
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

  async function openFile(path: string) {
    try {
      const url = await getSignedUrl(path);
      window.open(url, '_blank');
    } catch {
      toast('Could not open the file.', 'error');
    }
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

  return (
    <Modal
      open onClose={onClose} title={`Registration ${reg.reference}`} wide
      footer={
        <>
          <Button variant="outline" icon={<Copy className="h-3.5 w-3.5" />} onClick={() => void duplicate()}>Duplicate</Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()} loading={saving}>Save changes</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Status">
          <Select value={reg.status} onChange={(e) => setReg({ ...reg, status: e.target.value as RegistrationStatus })} aria-label="Registration status">
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
                  <span key={i} className="inline-flex items-center gap-1 rounded-full bg-navy-50 px-2.5 py-1 text-xs font-medium text-navy-700">
                    {b.label} {b.number && `(${b.number})`}
                    {heldBoothIds[i] && (
                      <button
                        aria-label={`Release booth ${b.label}`}
                        onClick={() => void releaseOne(heldBoothIds[i])}
                        className="text-navy-400 hover:text-red-500"
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
          </div>
        </Field>
        <Field label="Name">
          <Input value={reg.name ?? ''} onChange={(e) => setReg({ ...reg, name: e.target.value })} />
        </Field>
        <Field label="Email">
          <Input type="email" value={reg.email ?? ''} onChange={(e) => setReg({ ...reg, email: e.target.value })} />
        </Field>
        <Field label="Phone">
          <Input value={reg.phone ?? ''} onChange={(e) => setReg({ ...reg, phone: e.target.value })} />
        </Field>
      </div>

      <h3 className="mb-2 mt-6 text-sm font-semibold text-navy-800">Form answers</h3>
      <div className="space-y-3">
        {questionFields.map((f) => {
          const v = reg.data?.[f.id];
          if (isStoredFileRef(v)) {
            return (
              <Field key={f.id} label={f.label}>
                <Button size="sm" variant="outline" icon={<ExternalLink className="h-3.5 w-3.5" />} onClick={() => void openFile(v.path)}>
                  {v.name}
                </Button>
              </Field>
            );
          }
          if (Array.isArray(v)) {
            return (
              <Field key={f.id} label={f.label}>
                <Input value={v.join(', ')} onChange={(e) => setData(f.id, e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} />
              </Field>
            );
          }
          if (f.type === 'paragraph') {
            return (
              <Field key={f.id} label={f.label}>
                <Textarea rows={3} value={String(v ?? '')} onChange={(e) => setData(f.id, e.target.value)} />
              </Field>
            );
          }
          return (
            <Field key={f.id} label={f.label}>
              <Input value={String(v ?? '')} onChange={(e) => setData(f.id, e.target.value)} />
            </Field>
          );
        })}
        {questionFields.length === 0 && <p className="text-sm text-slate-500">This event has no form questions.</p>}
      </div>
    </Modal>
  );
}
