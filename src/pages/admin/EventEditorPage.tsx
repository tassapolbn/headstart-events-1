import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, BarChart3, ClipboardList, ExternalLink, FileText, LayoutGrid,
  Mail, Palette, QrCode, Save, Settings2, ShieldCheck, Tag,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { EventRecord } from '@/lib/types';
import { useEvent } from '@/hooks/useEvent';
import { publicEventUrl } from '@/lib/eventOps';
import { useToast } from '@/context/ToastContext';
import { Badge, Button, PageLoader } from '@/components/ui/basics';
import { Select } from '@/components/ui/inputs';
import { Tabs } from '@/components/ui/overlays';
import DetailsTab from './tabs/DetailsTab';
import BrandingTab from './tabs/BrandingTab';
import FormTab from './tabs/FormTab';
import FloorPlanTab from './tabs/FloorPlanTab';
import PoliciesTab from './tabs/PoliciesTab';
import EmailTab from './tabs/EmailTab';
import SettingsTab from './tabs/SettingsTab';

const tabList = [
  { id: 'details', label: 'Details', icon: <Tag className="h-4 w-4" /> },
  { id: 'branding', label: 'Branding & Theme', icon: <Palette className="h-4 w-4" /> },
  { id: 'form', label: 'Form Builder', icon: <FileText className="h-4 w-4" /> },
  { id: 'floorplan', label: 'Floor Plan', icon: <LayoutGrid className="h-4 w-4" /> },
  { id: 'policies', label: 'Policies', icon: <ShieldCheck className="h-4 w-4" /> },
  { id: 'email', label: 'Email', icon: <Mail className="h-4 w-4" /> },
  { id: 'settings', label: 'Settings', icon: <Settings2 className="h-4 w-4" /> },
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

  useEffect(() => { if (event) setDraft(event); }, [event]);

  const dirty = useMemo(
    () => !!draft && !!event && JSON.stringify(draft) !== JSON.stringify(event),
    [draft, event]
  );

  function update(patch: Partial<EventRecord>) {
    setDraft((d) => (d ? { ...d, ...patch } : d));
  }

  async function save() {
    if (!draft || !id) return;
    setSaving(true);
    const { id: _id, created_at, updated_at, ...fields } = draft;
    const { error: err } = await supabase.from('events').update(fields).eq('id', id);
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

  if (loading || !draft) return <PageLoader label="Loading event" />;
  if (error) return <p className="p-8 text-center text-sm text-red-600">{error}</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/admin/events" className="rounded-lg p-2 text-slate-500 hover:bg-slate-200" aria-label="Back to events">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate font-display text-xl font-bold text-navy-800">{draft.name}</h1>
            {dirty && <Badge color="amber">Unsaved changes</Badge>}
          </div>
          <p className="truncate text-xs text-slate-500">/e/{draft.slug}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={draft.status}
            onChange={(e) => update({ status: e.target.value as EventRecord['status'] })}
            className="w-32"
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
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <ExternalLink className="h-4 w-4" /> View
          </a>
          <Button onClick={() => void save()} loading={saving} disabled={!dirty} icon={<Save className="h-4 w-4" />}>
            Save
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link to={`/admin/events/${id}/registrations`} className="inline-flex items-center gap-1.5 rounded-lg bg-navy-50 px-3 py-1.5 text-xs font-medium text-navy-700 hover:bg-navy-100">
          <ClipboardList className="h-3.5 w-3.5" /> Registrations
        </Link>
        <Link to={`/admin/events/${id}/analytics`} className="inline-flex items-center gap-1.5 rounded-lg bg-navy-50 px-3 py-1.5 text-xs font-medium text-navy-700 hover:bg-navy-100">
          <BarChart3 className="h-3.5 w-3.5" /> Analytics
        </Link>
        <Link to={`/admin/events/${id}/checkin`} className="inline-flex items-center gap-1.5 rounded-lg bg-navy-50 px-3 py-1.5 text-xs font-medium text-navy-700 hover:bg-navy-100">
          <QrCode className="h-3.5 w-3.5" /> Check in
        </Link>
        <Link to={`/admin/events/${id}/signs`} className="inline-flex items-center gap-1.5 rounded-lg bg-navy-50 px-3 py-1.5 text-xs font-medium text-navy-700 hover:bg-navy-100">
          <Tag className="h-3.5 w-3.5" /> Vendor signs
        </Link>
      </div>

      <Tabs tabs={tabList} active={tab} onChange={setTab} />

      {tab === 'details' && <DetailsTab draft={draft} update={update} />}
      {tab === 'branding' && <BrandingTab draft={draft} update={update} />}
      {tab === 'form' && <FormTab draft={draft} update={update} />}
      {tab === 'floorplan' && <FloorPlanTab draft={draft} update={update} />}
      {tab === 'policies' && <PoliciesTab draft={draft} update={update} />}
      {tab === 'email' && <EmailTab draft={draft} update={update} />}
      {tab === 'settings' && <SettingsTab draft={draft} update={update} />}

      {dirty && (
        <div className="no-print sticky bottom-3 z-20 flex justify-center">
          <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-card">
            <span className="text-xs text-slate-500">You have unsaved changes</span>
            <Button size="sm" onClick={() => void save()} loading={saving}>Save now</Button>
          </div>
        </div>
      )}
    </div>
  );
}
