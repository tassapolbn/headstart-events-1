import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, BarChart3, ClipboardList, ExternalLink, FileText, LayoutGrid,
  Link2, Mail, Map, Palette, QrCode, Save, Settings2, ShieldCheck, Tag,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { invalidNotificationEmails, normalizeNotificationEmails, notificationEmailEntries } from '@/lib/notificationEmails';
import type { EventRecord } from '@/lib/types';
import { useEvent } from '@/hooks/useEvent';
import { publicEventUrl } from '@/lib/eventOps';
import { useToast } from '@/context/ToastContext';
import { Badge, Button, PageLoader } from '@/components/ui/basics';
import { Select } from '@/components/ui/inputs';
import { Tabs } from '@/components/ui/overlays';
import { useCampus } from '@/context/CampusContext';
import { formCopy } from '@/lib/formCopy';
import { googleSheetId } from '@/lib/googleSheets';
import DetailsTab from './tabs/DetailsTab';
import PageDesignTab from './tabs/PageDesignTab';
import BrandingTab from './tabs/BrandingTab';
import FormTab from './tabs/FormTab';
import FloorPlanTab from './tabs/FloorPlanTab';
import PoliciesTab from './tabs/PoliciesTab';
import EmailTab from './tabs/EmailTab';
import SettingsTab from './tabs/SettingsTab';
import ShareTab from './tabs/ShareTab';

const tabList = [
  { id: 'details', label: 'Details', icon: <Tag className="h-4 w-4" /> },
  { id: 'design', label: 'Page Design', icon: <LayoutGrid className="h-4 w-4" /> },
  { id: 'branding', label: 'Branding & Theme', icon: <Palette className="h-4 w-4" /> },
  { id: 'form', label: 'Form Builder', icon: <FileText className="h-4 w-4" /> },
  { id: 'floorplan', label: 'Floor Plan', icon: <LayoutGrid className="h-4 w-4" /> },
  { id: 'policies', label: 'Policies', icon: <ShieldCheck className="h-4 w-4" /> },
  { id: 'email', label: 'Email', icon: <Mail className="h-4 w-4" /> },
  { id: 'settings', label: 'Settings', icon: <Settings2 className="h-4 w-4" /> },
  { id: 'share', label: 'Share', icon: <Link2 className="h-4 w-4" /> },
];

export type TabProps = {
  draft: EventRecord;
  update: (patch: Partial<EventRecord>) => void;
};

export default function EventEditorPage() {
  const { id } = useParams<{ id: string }>();
  const { event, loading, error, reload } = useEvent(id);
  const { toast } = useToast();
  const [tab, setTab] = useState('details');
  const [draft, setDraft] = useState<EventRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const { campuses } = useCampus();
  const campusTag = campuses.find((c) => c.id === draft?.campus_id);

  useEffect(() => { if (event) setDraft(event); }, [event]);

  // Anticipatory shortcut: the dashboard offers to continue where you left off.
  useEffect(() => {
    if (event) {
      try {
        localStorage.setItem('hs:lastEvent', JSON.stringify({ id: event.id, name: event.name, at: Date.now() }));
      } catch { /* private mode, ignore */ }
    }
  }, [event?.id, event?.name]);

  const dirty = useMemo(
    () => !!draft && !!event && JSON.stringify(draft) !== JSON.stringify(event),
    [draft, event]
  );

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function update(patch: Partial<EventRecord>) {
    setDraft((d) => (d ? { ...d, ...patch } : d));
  }

  async function save() {
    if (!draft || !id) return;
    const recipients = notificationEmailEntries(draft.email_template);
    if (invalidNotificationEmails(recipients).length) {
      setTab('email');
      toast('Please correct the notification email addresses before saving.', 'error');
      return;
    }
    if (draft.settings.googleSheetUrl?.trim() && !googleSheetId(draft.settings.googleSheetUrl)) {
      setTab('settings');
      toast('Please enter a valid Google Sheet link, or clear it to disconnect.', 'error');
      return;
    }
    setSaving(true);
    const { id: _id, created_at, updated_at, ...fields } = draft;
    // Save recipients as the one list the email relay reads. Any older single
    // address is folded into it, so the Email tab always shows who is told.
    fields.email_template = {
      ...fields.email_template,
      adminEmails: normalizeNotificationEmails(recipients),
      adminEmail: '',
    };
    fields.settings = { ...fields.settings, googleSheetUrl: fields.settings.googleSheetUrl?.trim() || undefined };
    const { error: err } = await supabase.from('events').update(fields).eq('id', id).select('id').single();
    setSaving(false);
    if (err) {
      toast(
        err.message.includes('events_slug_key')
          ? 'That custom URL is already used by another event. Please choose a different one.'
          : err.message,
        'error'
      );
      return;
    }
    toast('Event saved.');
    void reload();
  }

  if (error) return <p className="p-8 text-center text-sm text-red-600">{error}</p>;

  if (loading || !draft) return <PageLoader label="Loading event" />;

  const copy = formCopy(draft);
  // Surveys have no floor plan, check in, vendor signs or printed plan.
  const visibleTabs = copy.isSurvey ? tabList.filter((t) => t.id !== 'floorplan') : tabList;
  const activeTab = copy.isSurvey && tab === 'floorplan' ? 'details' : tab;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
        <Link to="/admin/events" className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200 sm:h-10 sm:w-10" aria-label="Back to events">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 max-w-full truncate font-display text-xl font-bold text-navy-800 sm:text-2xl">{draft.name}</h1>
            {campusTag && (
              <span className="rounded-full px-2.5 py-0.5 text-xs font-bold text-white" style={{ background: campusTag.accent }}>
                {campusTag.name}
              </span>
            )}
            <Badge color={copy.isSurvey ? 'amber' : 'blue'}>{copy.typeLabel}</Badge>
            {dirty && <Badge color="amber">Unsaved changes</Badge>}
          </div>
          <p className="truncate text-xs text-slate-500">/e/{draft.slug}</p>
        </div>
        <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 sm:flex sm:w-auto">
          <Select
            value={draft.status}
            onChange={(e) => update({ status: e.target.value as EventRecord['status'] })}
            className="sm:w-32"
            aria-label="Event status"
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="waitlist">Waitlist</option>
          </Select>
          <a
            href={publicEventUrl(draft.slug)} target="_blank" rel="noreferrer"
            title="View saved page"
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:min-h-10"
          >
            <ExternalLink className="h-4 w-4" /> <span className="hidden sm:inline">View saved page</span><span className="sm:hidden">View</span>
          </a>
          <Button onClick={() => void save()} loading={saving} disabled={!dirty} icon={<Save className="h-4 w-4" />}>
            Save
          </Button>
        </div>
      </div>

      {/* Shortcuts to the event's other pages: one sideways row on phones */}
      <nav aria-label="Event pages" className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
          {[
            { to: 'registrations', icon: ClipboardList, label: copy.entries, show: true },
            { to: 'analytics', icon: BarChart3, label: 'Analytics', show: true },
            { to: 'checkin', icon: QrCode, label: 'Check in', show: !copy.isSurvey },
            { to: 'signs', icon: Tag, label: 'Vendor signs', show: !copy.isSurvey },
            { to: 'plan', icon: Map, label: 'Print floor plan', show: !copy.isSurvey },
          ].filter((l) => l.show).map(({ to, icon: Icon, label }) => (
            <Link
              key={to}
              to={`/admin/events/${id}/${to}`}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-navy-100 bg-white px-3.5 text-xs font-medium text-navy-700 transition hover:border-navy-200 hover:bg-navy-50 sm:min-h-8"
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </Link>
          ))}
        </div>
      </nav>

      <Tabs tabs={visibleTabs} active={activeTab} onChange={setTab} />

      <fieldset disabled={saving} className="min-w-0">
      {activeTab === 'details' && <DetailsTab draft={draft} update={update} />}
      {activeTab === 'design' && <PageDesignTab draft={draft} update={update} />}
      {activeTab === 'branding' && <BrandingTab draft={draft} update={update} />}
      {activeTab === 'form' && <FormTab draft={draft} update={update} />}
      {activeTab === 'floorplan' && <FloorPlanTab draft={draft} update={update} />}
      {activeTab === 'policies' && <PoliciesTab draft={draft} update={update} />}
      {activeTab === 'email' && <EmailTab draft={draft} update={update} />}
      {activeTab === 'settings' && <SettingsTab draft={draft} update={update} />}
      {activeTab === 'share' && <ShareTab draft={draft} update={update} />}

      </fieldset>

      {dirty && (
        <div className="no-print sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 flex justify-center">
          <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white/95 py-1.5 pl-4 pr-1.5 shadow-lg backdrop-blur">            <span className="text-xs text-slate-500">You have unsaved changes</span>
            <Button size="sm" onClick={() => void save()} loading={saving}>Save now</Button>
          </div>
        </div>
      )}
    </div>
  );
}
