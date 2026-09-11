import { useEffect, useState, type FormEvent } from 'react';
import { Mail, Plus, Save, Send, Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Campus } from '@/lib/types';
import { useCampus } from '@/context/CampusContext';
import { CampusBadge } from '@/components/CampusSwitcher';
import { useToast } from '@/context/ToastContext';
import { Button, Card, PageLoader } from '@/components/ui/basics';
import { ColorInput, Field, Input } from '@/components/ui/inputs';
import { ImageUpload } from '@/components/ui/ImageUpload';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SettingsPage() {
  const { toast } = useToast();
  const { campusId, campus, reload } = useCampus();
  const [row, setRow] = useState<Campus | null>(null);
  const [saving, setSaving] = useState(false);
  const [newEmail, setNewEmail] = useState('');

  useEffect(() => {
    setRow(null);
    supabase.from('campuses').select('*').eq('id', campusId).maybeSingle().then(({ data }) => {
      if (data) {
        setRow({
          ...(data as Campus),
          notify_emails: Array.isArray((data as Campus).notify_emails) ? (data as Campus).notify_emails : [],
        });
      }
    });
  }, [campusId]);

  function set<K extends keyof Campus>(key: K, value: Campus[K]) {
    setRow((r) => (r ? { ...r, [key]: value } : r));
  }

  function addEmail(e?: FormEvent) {
    e?.preventDefault();
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    if (!EMAIL_RE.test(email)) { toast('Please enter a valid email address.', 'error'); return; }
    if (row?.notify_emails.includes(email)) { toast('That address is already on the list.', 'error'); return; }
    set('notify_emails', [...(row?.notify_emails ?? []), email]);
    setNewEmail('');
  }

  function removeEmail(email: string) {
    set('notify_emails', (row?.notify_emails ?? []).filter((x) => x !== email));
  }

  async function save() {
    if (!row) return;
    setSaving(true);
    const { error } = await supabase
      .from('campuses')
      .update({
        school_name: row.school_name,
        logo_url: row.logo_url,
        email_logo_url: row.email_logo_url,
        webhook_url: row.webhook_url,
        notify_emails: row.notify_emails,
        accent: row.accent,
      })
      .eq('id', row.id);
    setSaving(false);
    if (error) { toast(error.message, 'error'); return; }
    toast(`${row.name} settings saved.`);
    void reload();
  }

  function sendTest() {
    if (!row?.webhook_url) { toast('Add the email relay URL first.', 'error'); return; }
    void fetch(row.webhook_url, {
      method: 'POST', mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ test: true, campus: row.id }),
    }).catch(() => undefined);
    toast('Test requested. Every saved test recipient should receive it shortly.');
  }

  if (!row) return <PageLoader label="Loading settings" />;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-bold text-navy-800">Settings</h1>
          <CampusBadge />
        </div>
        <p className="text-sm text-slate-500">
          Identity and email delivery for {campus?.name ?? 'this campus'}. Switch campus in the sidebar to edit the other one.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={`${row.name} identity`}>
          <div className="space-y-4">
            <Field label="Campus display name" htmlFor="set-cname" hint="The short label shown on the campus switcher.">
              <Input id="set-cname" value={row.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label="School / campus full name" htmlFor="set-name">
              <Input id="set-name" value={row.school_name} onChange={(e) => set('school_name', e.target.value)} />
            </Field>
            <ColorInput label="Campus accent colour" value={row.accent} onChange={(accent) => set('accent', accent)} />
            <ImageUpload
              label="Default campus logo"
              value={row.logo_url ?? undefined}
              onChange={(logo_url) => set('logo_url', logo_url ?? null)}
              prefix={`campus-${row.id}`}
              hint="Used on public pages and vendor signs unless an event has its own logo."
            />
            <ImageUpload
              label="Email header logo (white version)"
              value={row.email_logo_url ?? undefined}
              onChange={(email_logo_url) => set('email_logo_url', email_logo_url ?? null)}
              prefix={`campus-${row.id}`}
              hint="The email header is dark, so upload the white PNG logo here. When set, the school name text is removed from the header."
              dark
            />
          </div>
        </Card>

        <div className="space-y-5">
          <Card title="Email relay test recipients">
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                This list receives relay test emails only. Choose registration notification recipients separately in each event’s Email tab.
              </p>
              <div>
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Test recipients</span>
                {row.notify_emails.length === 0 ? (
                  <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">No recipients yet. Add at least one address below.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {row.notify_emails.map((email) => (
                      <li key={email} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                        <span className="flex min-w-0 items-center gap-2 text-sm text-slate-700">
                          <Mail className="h-4 w-4 shrink-0 text-slate-400" />
                          <span className="truncate">{email}</span>
                        </span>
                        <button
                          onClick={() => removeEmail(email)}
                          aria-label={`Remove ${email}`}
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <form onSubmit={addEmail} className="flex gap-2">
                <Input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="name@headstartphuket.com"
                  aria-label="Add a test recipient email"
                />
                <Button type="submit" variant="outline" icon={<Plus className="h-4 w-4" />}>Add</Button>
              </form>
            </div>
          </Card>

          <Card title="Email relay">
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Confirmation and notification emails are sent by the Apps Script relay. Paste its web app URL here.
                Both campuses can use the same relay, or a separate one each.
              </p>
              <Field label="Relay web app URL" htmlFor="set-webhook" hint="Looks like https://script.google.com/macros/s/…/exec">
                <Input id="set-webhook" value={row.webhook_url ?? ''} onChange={(e) => set('webhook_url', e.target.value || null)} placeholder="https://script.google.com/macros/s/…/exec" />
              </Field>
              <Button variant="outline" icon={<Send className="h-4 w-4" />} onClick={sendTest}>Send a test to all recipients</Button>
            </div>
          </Card>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => void save()} loading={saving} icon={<Save className="h-4 w-4" />}>Save {row.name} settings</Button>
      </div>
    </div>
  );
}
