import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarPlus, ClipboardList, Copy, ExternalLink, Link2, MessageSquareText, Pencil, Search, Shapes, Ticket, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { EventRecord, EventTemplateRecord, FormType } from '@/lib/types';
import { copyForType, formCopy, formTypeOf } from '@/lib/formCopy';
import { formatDate } from '@/lib/utils';
import { createBlankEvent, createFromTemplate, deleteEvent, duplicateEvent, publicEventUrl, saveAsTemplate } from '@/lib/eventOps';
import { useCampus } from '@/context/CampusContext';
import { CampusBadge } from '@/components/CampusSwitcher';
import { useToast } from '@/context/ToastContext';
import { Badge, Button, Card, EmptyState, PageLoader } from '@/components/ui/basics';
import { Field, Input, Select, Textarea } from '@/components/ui/inputs';
import { ConfirmDialog, Modal } from '@/components/ui/overlays';

type EventRow = EventRecord & { registrations: Array<{ count: number }> };

const statusColor: Record<string, 'gray' | 'green' | 'blue' | 'amber' | 'red'> = {
  draft: 'gray', published: 'blue', open: 'green', closed: 'red', waitlist: 'amber',
};
const filters = ['all', 'draft', 'published', 'open', 'closed', 'waitlist', 'past'] as const;
const typeFilters: Array<{ id: 'all' | FormType; label: string }> = [
  { id: 'all', label: 'All types' },
  { id: 'registration', label: 'Event registration' },
  { id: 'survey', label: 'Survey / Feedback' },
];

export default function EventsListPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { campusId, campus } = useCampus();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<EventRow[]>([]);
  const [templates, setTemplates] = useState<EventTemplateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<(typeof filters)[number]>('all');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | FormType>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  // Create modal
  const [createOpen, setCreateOpen] = useState(params.get('new') === '1');
  const [newName, setNewName] = useState('');
  const [newFrom, setNewFrom] = useState('blank');
  const [newType, setNewType] = useState<FormType>(params.get('type') === 'survey' ? 'survey' : 'registration');
  const [creating, setCreating] = useState(false);

  // Save as template modal
  const [tplFor, setTplFor] = useState<EventRow | null>(null);
  const [tplName, setTplName] = useState('');
  const [tplDesc, setTplDesc] = useState('');

  const [deleteFor, setDeleteFor] = useState<EventRow | null>(null);

  async function load() {
    const [ev, tpl] = await Promise.all([
      supabase.from('events').select('*, registrations(count)').eq('campus_id', campusId).order('created_at', { ascending: false }),
      supabase.from('event_templates').select('*').eq('campus_id', campusId).order('created_at', { ascending: false }),
    ]);
    setRows((ev.data ?? []) as EventRow[]);
    setTemplates((tpl.data ?? []) as EventTemplateRecord[]);
    setLoading(false);
  }
  useEffect(() => { void load(); }, [campusId]);

  const today = new Date().toISOString().slice(0, 10);
  const visible = useMemo(() => {
    let list = rows;
    if (filter === 'past') list = list.filter((e) => e.event_date && e.event_date < today);
    else if (filter !== 'all') list = list.filter((e) => e.status === filter);
    if (typeFilter !== 'all') list = list.filter((e) => formTypeOf(e) === typeFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((e) => e.name.toLowerCase().includes(q) || e.location.toLowerCase().includes(q));
    return list;
  }, [rows, filter, typeFilter, search, today]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      let id: string;
      if (newFrom === 'blank') {
        id = await createBlankEvent(newName.trim(), campusId, newType);
      } else {
        const tpl = templates.find((t) => t.id === newFrom);
        if (!tpl) throw new Error('Template not found');
        id = await createFromTemplate(tpl.snapshot, newName.trim(), campusId);
      }
      toast(newType === 'survey' && newFrom === 'blank' ? 'Survey created.' : 'Event created.');
      navigate(`/admin/events/${id}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not create the event.', 'error');
    } finally {
      setCreating(false);
    }
  }

  async function handleDuplicate(row: EventRow) {
    setBusyId(row.id);
    try {
      const id = await duplicateEvent(row.id);
      toast(`Duplicated "${row.name}".`);
      navigate(`/admin/events/${id}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Duplicate failed.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function handleSaveTemplate() {
    if (!tplFor || !tplName.trim()) return;
    try {
      await saveAsTemplate(tplFor.id, tplName.trim(), tplDesc.trim());
      toast('Saved as a reusable template.');
      setTplFor(null);
      void load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save template.', 'error');
    }
  }

  async function handleDelete() {
    if (!deleteFor) return;
    try {
      await deleteEvent(deleteFor.id);
      toast(`Deleted "${deleteFor.name}".`);
      setRows((r) => r.filter((x) => x.id !== deleteFor.id));
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Delete failed.', 'error');
    }
  }

  function copyLink(row: EventRow) {
    void navigator.clipboard.writeText(publicEventUrl(row.slug));
    toast('Public link copied.');
  }

  if (loading) return <PageLoader label="Loading events" />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-bold text-navy-800">Events</h1>
            <CampusBadge />
          </div>
          <p className="text-sm text-slate-500">Create, publish and manage event registrations and surveys for {campus?.name ?? 'this campus'}.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" icon={<MessageSquareText className="h-4 w-4" />} onClick={() => { setNewType('survey'); setCreateOpen(true); }}>New Survey / Feedback</Button>
          <Button icon={<CalendarPlus className="h-4 w-4" />} onClick={() => { setNewType('registration'); setCreateOpen(true); }}>Create New Event</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1 rounded-xl bg-slate-200/70 p-1">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition ${filter === f ? 'bg-white text-navy-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl bg-slate-200/70 p-1">
          {typeFilters.map((f) => (
            <button
              key={f.id}
              onClick={() => setTypeFilter(f.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${typeFilter === f.id ? 'bg-white text-navy-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search events" className="pl-9" aria-label="Search events" />
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title="No events found"
          hint="Create your first event, or adjust the filters above."
          action={<Button icon={<CalendarPlus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>Create New Event</Button>}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((e) => {
            const count = e.registrations?.[0]?.count ?? 0;
            const copy = formCopy(e);
            return (
              <Card key={e.id} padded={false} className="overflow-hidden">
                <div
                  className="h-24 bg-navy-700 bg-cover bg-center"
                  style={e.branding?.banner_url || e.branding?.poster_url ? { backgroundImage: `url(${e.branding.banner_url ?? e.branding.poster_url})` } : undefined}
                >
                  <div className="flex h-full items-start justify-between p-3">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge color={statusColor[e.status]} className="capitalize">{e.status}</Badge>
                      <Badge color={copy.isSurvey ? 'amber' : 'blue'}>{copy.typeLabel}</Badge>
                    </div>
                    <span className="rounded-full bg-white/90 px-2.5 py-0.5 text-xs font-semibold text-navy-800">{copy.countLabel(count)}</span>
                  </div>
                </div>
                <div className="space-y-3 p-4">
                  <div>
                    <Link to={`/admin/events/${e.id}`} className="font-display text-base font-semibold text-navy-800 hover:underline">{e.name}</Link>
                    <p className="text-xs text-slate-500">
                      {e.event_date ? formatDate(e.event_date, 'EEE d MMM yyyy') : copy.isSurvey ? 'No date' : 'Date not set'}
                      {e.location ? ` - ${e.location}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant="outline" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => navigate(`/admin/events/${e.id}`)}>Edit</Button>
                    <Button size="sm" variant="outline" icon={<ClipboardList className="h-3.5 w-3.5" />} onClick={() => navigate(`/admin/events/${e.id}/registrations`)}>{copy.entries}</Button>
                    <Button size="sm" variant="outline" icon={<Copy className="h-3.5 w-3.5" />} loading={busyId === e.id} onClick={() => void handleDuplicate(e)}>Duplicate</Button>
                    <Button size="sm" variant="outline" icon={<Shapes className="h-3.5 w-3.5" />} onClick={() => { setTplFor(e); setTplName(e.name); setTplDesc(''); }}>Save as template</Button>
                    <Button size="sm" variant="outline" icon={<Link2 className="h-3.5 w-3.5" />} onClick={() => copyLink(e)}>Copy link</Button>
                    <a href={publicEventUrl(e.slug)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                      <ExternalLink className="h-3.5 w-3.5" /> View
                    </a>
                    <Button size="sm" variant="ghost" className="text-red-500 hover:bg-red-50" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setDeleteFor(e)}>Delete</Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create event */}
      <Modal
        open={createOpen}
        onClose={() => { setCreateOpen(false); if (params.get('new')) setParams({}); }}
        title={newType === 'survey' ? 'Create a new survey or feedback form' : 'Create a new event'}
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleCreate()} loading={creating} disabled={!newName.trim()}>
              {newType === 'survey' ? 'Create form' : 'Create event'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-700">What are you creating?</p>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Form type">
              {([
                { id: 'registration', icon: Ticket, title: '1. Event registration form', text: 'Sign ups with reference number, QR check in, booths and a confirmation email.' },
                { id: 'survey', icon: MessageSquareText, title: '2. Survey, questionnaire or feedback', text: 'Neutral wording, optional name and email, and a simple thank you email.' },
              ] as const).map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={newType === o.id}
                  onClick={() => setNewType(o.id)}
                  className={`rounded-xl border-2 p-3 text-left transition ${newType === o.id ? 'border-navy-600 bg-navy-50' : 'border-slate-200 hover:border-slate-300'}`}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-navy-800">
                    <o.icon className="h-4 w-4" /> {o.title}
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">{o.text}</span>
                </button>
              ))}
            </div>
          </div>
          <Field label={newType === 'survey' ? 'Form name' : 'Event name'} htmlFor="new-event-name" required>
            <Input
              id="new-event-name" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus
              placeholder={newType === 'survey' ? 'e.g. Christmas Fair 2026 Parent Feedback' : 'e.g. Christmas Fair 2026'}
            />
          </Field>
          <Field
            label="Start from"
            hint={newFrom === 'blank'
              ? `A blank ${copyForType(newType).typeLabel.toLowerCase()} with starter questions you can edit.`
              : 'Templates copy the form, theme, floor plan, policies and email design, including the form type.'}
          >
            <Select value={newFrom} onChange={(e) => setNewFrom(e.target.value)} aria-label="Start from template">
              <option value="blank">{newType === 'survey' ? 'Blank survey / feedback form' : 'Blank event'}</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>Template: {t.name}</option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>

      {/* Save as template */}
      <Modal
        open={!!tplFor}
        onClose={() => setTplFor(null)}
        title="Save event as template"
        footer={
          <>
            <Button variant="outline" onClick={() => setTplFor(null)}>Cancel</Button>
            <Button onClick={() => void handleSaveTemplate()} disabled={!tplName.trim()}>Save template</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Template name" htmlFor="tpl-name" required>
            <Input id="tpl-name" value={tplName} onChange={(e) => setTplName(e.target.value)} />
          </Field>
          <Field label="Description" htmlFor="tpl-desc">
            <Textarea id="tpl-desc" rows={3} value={tplDesc} onChange={(e) => setTplDesc(e.target.value)} placeholder="What is this template for?" />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteFor}
        onClose={() => setDeleteFor(null)}
        onConfirm={() => void handleDelete()}
        title="Delete this event?"
        message={`"${deleteFor?.name}" and all of its registrations, booths and files will be permanently removed. This cannot be undone.`}
        confirmLabel="Delete event"
        danger
      />
    </div>
  );
}
