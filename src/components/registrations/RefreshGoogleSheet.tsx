import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { googleSheetId } from '@/lib/googleSheets';
import { useCampus } from '@/context/CampusContext';
import { useToast } from '@/context/ToastContext';
import { Button } from '@/components/ui/basics';
import type { EventRecord } from '@/lib/types';

export function RefreshGoogleSheet({ event }: { event: EventRecord }) {
  const [busy, setBusy] = useState(false);
  const { campuses } = useCampus();
  const { toast } = useToast();
  async function refresh() {
    const name = `headstart-sheet-${Date.now()}`;
    const popup = window.open('', name);
    if (!popup) { toast('Allow a new tab for the sheet refresh, then try again.', 'error'); return; }
    popup.opener = null;
    popup.document.title = 'Refreshing Google Sheet';
    popup.document.body.textContent = 'Preparing your Google Sheet refresh…';
    setBusy(true);
    try {
      let relay = campuses.find(c => c.id === event.campus_id)?.webhook_url;
      if (!relay) {
        const { data, error } = await supabase.from('app_settings').select('webhook_url').eq('id', 1).maybeSingle();
        if (error) throw error;
        relay = data?.webhook_url;
      }
      if (!relay || !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(relay.trim())) {
        throw new Error('Configure the Google Apps Script relay URL in Settings first.');
      }
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) throw new Error('Sign in again before refreshing.');
      // POST the short-lived token only to the validated Google endpoint. It
      // never appears in the URL. The server verifies the user's staff role.
      const form = document.createElement('form');
      form.method = 'POST'; form.action = relay.trim(); form.target = name;
      const input = document.createElement('input');
      input.type = 'hidden'; input.name = 'request';
      input.value = JSON.stringify({ action: 'google_sheet_refresh', eventId: event.id, accessToken: data.session.access_token });
      form.appendChild(input); document.body.appendChild(form); form.submit(); form.remove();
      toast('The new tab will show whether the sheet refresh succeeds.');
    } catch (error) { popup.close(); toast(error instanceof Error ? error.message : 'Could not refresh the sheet.', 'error'); }
    finally { setBusy(false); }
  }
  if (!googleSheetId(event.settings.googleSheetUrl)) return null;
  return <Button type="button" variant="outline" size="sm" loading={busy} icon={<RefreshCw className="h-4 w-4" />} onClick={() => void refresh()}>Refresh Google Sheet</Button>;
}
