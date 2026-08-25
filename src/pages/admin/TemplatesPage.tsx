import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarPlus, Pencil, Shapes, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { EventTemplateRecord } from '@/lib/types';
import { createFromTemplate } from '@/lib/eventOps';
import { useCampus } from '@/context/CampusContext';
import { CampusBadge } from '@/components/CampusSwitcher';
import { formatDate } from '@/lib/utils';
import { useToast } from '@/context/ToastContext';
import { Button, Card, EmptyState, PageLoader } from '@/components/ui/basics';
import { Field, Input, Textarea } from '@/components/ui/inputs';
import { ConfirmDialog, Modal } from '@/components/ui/overlays';

export default function TemplatesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { campusId, campus } = useCampus();
  const [templates, setTemplates] = useState<EventTemplateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [useFor, setUseFor] = useState<EventTemplateRecord | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [renameFor, setRenameFor] = useState<EventTemplateRecord | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameDesc, setRenameDesc] = useState('');
  const [deleteFor, setDeleteFor] = useState<EventTemplateRecord | null>(null);

  async function load() {
    const { data } = await supabase.from('event_templates').select('*').eq('campus_id', campusId).order('created_at', { ascending: false });
    setTemplates((data ?? []) as EventTemplateRecord[]);
    setLoading(false);
  }
  useEffect(() => { void load(); }, [campusId]);

  async function handleUse() {
    if (!useFor || !newName.trim()) return;
    setCreating(true);
    try {
      const id = await createFromTemplate(useFor.snapshot, newName.trim(), campusId);
      toast('Event created from template.');
      navigate(`/admin/events/${id}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not create the event.', 'error');
    } finally {
      setCreating(false);
    }
  }

  async function handleRename() {
    if (!renameFor || !renameValue.trim()) return;
    const { error } = await supabase
      .from('event_templates')
      .update({ name: renameValue.trim(), description: renameDesc.trim() })
      .eq('id', renameFor.id);
    if (error) toast(error.message, 'error');
    else {
      toast('Template updated.');
      setRenameFor(null);
      void load();
    }
  }

  async function handleDelete() {
    if (!deleteFor) return;
    const { error } = await supabase.from('event_templates').delete().eq('id', deleteFor.id);
    if (error) toast(error.message, 'error');
    else {
      toast('Template deleted.');
      void load();
    }
  }

  if (loading) return <PageLoader label="Loading templates" />;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-bold text-navy-800">Event templates</h1>
          <CampusBadge />
        </div>
        <p className="text-sm text-slate-500">
          Reusable blueprints. A template copies the form, theme, floor plan, policies, email design and settings.
        </p>
      </div>

      {templates.length === 0 ? (
        <EmptyState
          icon={<Shapes className="h-8 w-8" />}
          title="No templates yet"
          hint='Open any event and choose "Save as template" to create one, e.g. Friday Market or Christmas Fair.'
          action={<Button onClick={() => navigate('/admin/events')}>Go to events</Button>}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((t) => {
            const q = Array.isArray(t.snapshot?.event?.form_schema) ? t.snapshot.event.form_schema.length : 0;
            const b = Array.isArray(t.snapshot?.booths) ? t.snapshot.booths.length : 0;
            return (
              <Card key={t.id}>
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="font-display text-base font-semibold text-navy-800">{t.name}</h2>
                      <p className="text-xs text-slate-400">Saved {formatDate(t.created_at.slice(0, 10), 'd MMM yyyy')}</p>
                    </div>
                    <Shapes className="h-5 w-5 shrink-0 text-gold-500" />
                  </div>
                  {t.description && <p className="text-sm text-slate-600">{t.description}</p>}
                  <p className="text-xs text-slate-500">{q} questions - {b} booths</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" icon={<CalendarPlus className="h-3.5 w-3.5" />} onClick={() => { setUseFor(t); setNewName(''); }}>
                      Create event
                    </Button>
                    <Button size="sm" variant="outline" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => { setRenameFor(t); setRenameValue(t.name); setRenameDesc(t.description); }}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-500 hover:bg-red-50" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setDeleteFor(t)}>
                      Delete
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={!!useFor}
        onClose={() => setUseFor(null)}
        title={`New event from "${useFor?.name}"`}
        footer={
          <>
            <Button variant="outline" onClick={() => setUseFor(null)}>Cancel</Button>
            <Button onClick={() => void handleUse()} loading={creating} disabled={!newName.trim()}>Create event</Button>
          </>
        }
      >
        <Field label="New event name" htmlFor="use-name" required>
          <Input id="use-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Friday Market, 4 September" autoFocus />
        </Field>
      </Modal>

      <Modal
        open={!!renameFor}
        onClose={() => setRenameFor(null)}
        title="Edit template"
        footer={
          <>
            <Button variant="outline" onClick={() => setRenameFor(null)}>Cancel</Button>
            <Button onClick={() => void handleRename()} disabled={!renameValue.trim()}>Save</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Template name" required>
            <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
          </Field>
          <Field label="Description">
            <Textarea rows={3} value={renameDesc} onChange={(e) => setRenameDesc(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteFor}
        onClose={() => setDeleteFor(null)}
        onConfirm={() => void handleDelete()}
        title="Delete template?"
        message={`"${deleteFor?.name}" will be removed. Events already created from it are not affected.`}
        confirmLabel="Delete template"
        danger
      />
    </div>
  );
}
