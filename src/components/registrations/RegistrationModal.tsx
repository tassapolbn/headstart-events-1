import { useEffect, useMemo, useState } from 'react';
import { Copy, ExternalLink, Plus, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { storedAcks } from '@/components/policies/policyAcks';
import { FormattedText } from '@/components/ui/FormattedText';
import type { Booth, EventRecord, Registration, RegistrationStatus } from '@/lib/types';
import { isContentField } from '@/components/form-renderer/fieldZod';
import { getSignedUrl, isStoredFileRef } from '@/lib/storage';
import { boothList } from '@/lib/regBooths';
import { useToast } from '@/context/ToastContext';
import { useCampus } from '@/context/CampusContext';
import { missingAnswerFields, moveRegistration, pickTargetEvents } from '@/lib/moveRegistration';
import { Button } from '@/components/ui/basics';
import { Field, Input, Select, Textarea } from '@/components/ui/inputs';
import { AnswerEditor } from './AnswerEditor';
import { ConfirmDialog, Modal } from '@/components/ui/overlays';

type TargetEvent = Pick<EventRecord, 'id' | 'name' | 'campus_id' | 'status' | 'settings' | 'form_schema'>;

export function RegistrationModal({ event, registration, availableBooths, onClose, onSaved }: {
  event: EventRecord;
  registration: Registration;
  availableBooths: Booth[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [reg, setReg] = useState<Registration>(JSON.parse(JSON.stringify(registration)));
  const hasUnsavedChanges = reg.name !== registration.name
    || reg.email !== registration.email
    || reg.phone !== registration.phone
    || reg.status !== registration.status
    || JSON.stringify(reg.data) !== JSON.stringify(registration.data);
  const [saving, setSaving] = useState(false);
  const [assignBooth, setAssignBooth] = useState('');
  const { campuses } = useCampus();
  const otherCampuses = campuses.filter((c) => c.id !== event.campus_id);
  const [chosenCampus, setChosenCampus] = useState('');
  const campusId = otherCampuses.find((c) => c.id === chosenCampus)?.id ?? otherCampuses[0]?.id ?? '';
  const [targetEvents, setTargetEvents] = useState<TargetEvent[]>([]);
  const [targetId, setTargetId] = useState('');
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [eventsError, setEventsError] = useState('');
  const [confirmMove, setConfirmMove] = useState(false);
  const [moving, setMoving] = useState(false);
  const targetEvent = targetEvents.find((e) => e.id === targetId && e.campus_id === campusId);
  const campusName = otherCampuses.find((c) => c.id === campusId)?.name ?? '';
  const missingAnswers = targetEvent ? missingAnswerFields(registration.data, targetEvent.form_schema ?? []) : [];

  useEffect(() => {
    let cancelled = false;
    setTargetEvents([]);
    setTargetId('');
    setEventsError('');
    if (!campusId) return;
    setLoadingEvents(true);
    async function loadEvents() {
      try {
        const { data, error } = await supabase.from('events')
          .select('id, name, campus_id, status, settings, form_schema').eq('campus_id', campusId);
        if (error) throw new Error(error.message);
        if (cancelled) return;
        const matches = pickTargetEvents((data ?? []) as TargetEvent[], event, campusId);
        setTargetEvents(matches);
        setTargetId(matches[0]?.id ?? '');
      } catch (err) {
        if (!cancelled) setEventsError(err instanceof Error ? err.message : 'Could not load events.');
      } finally {
        if (!cancelled) setLoadingEvents(false);
      }
    }
    void loadEvents();
    return () => { cancelled = true; };
  }, [campusId, event]);

  async function move() {
    if (!targetEvent || moving || hasUnsavedChanges) return;
    setMoving(true);
    try {
      await moveRegistration(registration, targetEvent);
      toast(`Moved ${registration.reference} to ${campusName}. Refresh both Google Sheets if you use them.`);
      onSaved();
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Move failed.', 'error');
    } finally {
      setMoving(false);
    }
  }

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
    <>
    <Modal
      open onClose={() => { if (!moving && !confirmMove) onClose(); }} title={`Registration ${reg.reference}`} wide
      footer={
        <>
          <Button variant="outline" disabled={moving} icon={<Copy className="h-3.5 w-3.5" />} onClick={() => void duplicate()}>Duplicate</Button>
          <Button variant="outline" disabled={moving} onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()} loading={saving} disabled={moving}>Save changes</Button>
        </>
      }
    >
      <fieldset disabled={moving} className="min-w-0">
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

      {campuses.length > 1 && (
        <div className="mt-5 space-y-3 rounded-lg bg-slate-50 p-3 text-sm">
          <h3 className="font-semibold">Move to another campus</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Campus" className="min-w-0">
              <Select value={campusId} onChange={(e) => setChosenCampus(e.target.value)} disabled={moving} aria-label="Target campus">
                {otherCampuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Event" className="min-w-0">
              <Select value={targetEvent?.id ?? ''} onChange={(e) => setTargetId(e.target.value)} disabled={moving || loadingEvents || !targetEvents.length} aria-label="Target event">
                {!targetEvent && <option value="">{loadingEvents ? 'Loading events...' : 'Choose an event'}</option>}
                {targetEvents.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </Select>
            </Field>
          </div>
          {eventsError ? <p role="alert" className="text-red-600">{eventsError}</p> : !loadingEvents && !targetEvents.length && <p className="text-slate-500">No matching event in this campus yet</p>}
          {(registration.booth_id || !!registration.registration_booths?.length) && <p className="text-amber-700">Its booths in this event will be released.</p>}
          {registration.checked_in_at && <p className="text-amber-700">This person is checked in. The check-in will be cleared.</p>}
          {missingAnswers.length > 0 && <p className="text-amber-700">{missingAnswers.length} answers have no matching question in that event's form and will be hidden (they are kept).</p>}
          <Button variant="outline" className="w-full sm:w-auto" disabled={!targetEvent || loadingEvents || saving || hasUnsavedChanges} loading={moving} onClick={() => setConfirmMove(true)}>Move registration</Button>
          {hasUnsavedChanges && <p className="text-slate-500">Save or cancel your changes before moving.</p>}
        </div>
      )}

      {storedAcks(reg.data).length > 0 && <div className="mt-5 rounded-lg bg-slate-50 p-3 text-sm">
        <h3 className="font-semibold">Recorded consent</h3>
        {storedAcks(reg.data).map(ack => <div key={ack.id} className="mt-2"><FormattedText value={ack.text} /><p className="text-xs text-slate-500">Accepted: {ack.accepted_at}</p></div>)}
      </div>}
      <h3 className="mb-2 mt-6 text-sm font-semibold text-navy-800">Form answers</h3>
      <div className="space-y-3">
        {questionFields.map((f) => (
          <AnswerEditor
            key={f.id}
            field={f}
            value={reg.data?.[f.id]}
            onChange={(v) => setData(f.id, v)}
            onOpenFile={(path) => void openFile(path)}
          />
        ))}
        {questionFields.length === 0 && <p className="text-sm text-slate-500">This event has no form questions.</p>}
      </div>
      </fieldset>
    </Modal>
    <ConfirmDialog
      open={confirmMove} onClose={() => setConfirmMove(false)} onConfirm={() => void move()}
      title="Move registration" confirmLabel="Move registration"
      message={`Move ${registration.reference} to ${targetEvent?.name ?? ''} (${campusName})?`}
    />
    </>
  );
}
