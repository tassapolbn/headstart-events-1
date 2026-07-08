import { useEffect, useState } from 'react';
import { Save, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { AppSettings } from '@/lib/types';
import { useToast } from '@/context/ToastContext';
import { Button, Card, PageLoader } from '@/components/ui/basics';
import { Field, Input } from '@/components/ui/inputs';
import { ImageUpload } from '@/components/ui/ImageUpload';

export default function SettingsPage() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from('app_settings').select('*').eq('id', 1).maybeSingle().then(({ data }) => {
      setSettings((data as AppSettings) ?? { id: 1, school_name: 'HeadStart International School Phuket', logo_url: null, admin_email: null, webhook_url: null });
    });
  }, []);

  async function save() {
    if (!settings) return;
    setSaving(true);
    const { error } = await supabase
      .from('app_settings')
      .update({
        school_name: settings.school_name,
        logo_url: settings.logo_url,
        admin_email: settings.admin_email,
        webhook_url: settings.webhook_url,
      })
      .eq('id', 1);
    setSaving(false);
    if (error) toast(error.message, 'error');
    else toast('Settings saved.');
  }

  function sendTest() {
    if (!settings?.webhook_url) {
      toast('Add the email relay URL first.', 'error');
      return;
    }
    void fetch(settings.webhook_url, {
      method: 'POST', mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ test: true }),
    }).catch(() => undefined);
    toast('Test requested. Check the admin inbox in a minute.');
  }

  if (!settings) return <PageLoader label="Loading settings" />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-navy-800">Settings</h1>
        <p className="text-sm text-slate-500">School identity and email delivery.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="School identity">
          <div className="space-y-4">
            <Field label="School name" htmlFor="set-name">
              <Input id="set-name" value={settings.school_name} onChange={(e) => setSettings({ ...settings, school_name: e.target.value })} />
            </Field>
            <ImageUpload
              label="Default school logo"
              value={settings.logo_url ?? undefined}
              onChange={(logo_url) => setSettings({ ...settings, logo_url: logo_url ?? null })}
              prefix="app"
              hint="Used on public pages, emails and vendor signs unless an event has its own logo."
            />
          </div>
        </Card>

        <Card title="Email delivery (Apps Script relay)">
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Confirmation emails are sent by a small Google Apps Script web app from your school Gmail account.
              Deploy the script in <span className="font-mono text-xs">apps-script/EmailRelay.gs</span> (instructions in the README), then paste its web app URL here.
            </p>
            <Field label="Relay web app URL" htmlFor="set-webhook" hint="Looks like https://script.google.com/macros/s/…/exec">
              <Input id="set-webhook" value={settings.webhook_url ?? ''} onChange={(e) => setSettings({ ...settings, webhook_url: e.target.value || null })} placeholder="https://script.google.com/macros/s/…/exec" />
            </Field>
            <Field label="Administrator notification email" htmlFor="set-admin" hint="Receives a copy of each new registration and the daily summary.">
              <Input id="set-admin" type="email" value={settings.admin_email ?? ''} onChange={(e) => setSettings({ ...settings, admin_email: e.target.value || null })} placeholder="events.city@headstartphuket.com" />
            </Field>
            <Button variant="outline" icon={<Send className="h-4 w-4" />} onClick={sendTest}>Send a test email</Button>
          </div>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => void save()} loading={saving} icon={<Save className="h-4 w-4" />}>Save settings</Button>
      </div>
    </div>
  );
}
