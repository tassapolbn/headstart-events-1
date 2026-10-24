import { useEffect, useId, useState } from 'react';
import { Field, Input } from '@/components/ui/inputs';
import {
  canTotal, googleSheetId, SHEET_BUILTIN_COLUMNS, sheetColumnChoices, sheetColumnExclusions,
  sheetSharedEvents, sheetTabName, type SharedSheetEvent,
} from '@/lib/googleSheets';
import { supabase } from '@/lib/supabase';
import type { EventRecord, EventSettings } from '@/lib/types';

export function GoogleSheetColumns({ event, onChange }: {
  event: Pick<EventRecord, 'id' | 'name' | 'settings' | 'form_schema'>;
  onChange: (patch: Partial<EventSettings>) => void;
}) {
  const id = useId();
  const settings = event.settings;
  const sheetId = googleSheetId(settings.googleSheetUrl);
  const [shared, setShared] = useState<{ sheetId: string; eventId: string; events: SharedSheetEvent[] } | null>(null);

  useEffect(() => {
    let active = true;
    setShared(null);
    if (!sheetId) return;
    async function load() {
      try {
        const { data, error } = await supabase.from('events').select('id,name,settings->>googleSheetUrl,settings->>googleSheetTab');
        if (active && !error && data) setShared({ sheetId: sheetId!, eventId: event.id,
          events: sheetSharedEvents(data, event.id, sheetId) });
      } catch { /* A shared-file hint must not block settings. */ }
    }
    void load();
    return () => { active = false; };
  }, [sheetId, event.id]);

  const peers = shared?.sheetId === sheetId && shared?.eventId === event.id ? shared.events : [];
  const wanted = sheetTabName(settings, event.name);
  const collision = peers.some(peer => peer.tabName.toLowerCase() === wanted.toLowerCase());
  const choices = sheetColumnChoices(event.form_schema, settings);
  const sentCount = choices.filter(c => c.sent && !c.mergedInto).length;
  const totals = settings.googleSheetTotals ?? [];
  const checkbox = 'h-4 w-4 shrink-0 rounded accent-navy-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-300 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div className="min-w-0 space-y-4 border-t border-slate-200 pt-4">
      <Field label="Requested tab name" htmlFor={`${id}-tab`}>
        <Input id={`${id}-tab`} value={settings.googleSheetTab ?? ''} placeholder={event.name} maxLength={100}
          aria-describedby={`${id}-tab-hint`} onChange={e => onChange({ googleSheetTab: e.target.value })} />
        <p id={`${id}-tab-hint`} className="text-xs text-slate-500">
          Several events can share one spreadsheet, each with its own tab, such as “Friday Market 6 Nov” and
          “Friday Market 2 Oct”. Blank uses the event name. Save, then click Refresh Google Sheet to create the tab right away.
        </p>
      </Field>

      {peers.length > 0 && (
        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <p className="font-medium text-slate-700">Other events using this spreadsheet</p>
          <ul className="mt-1 space-y-1">
            {peers.map(peer => <li key={peer.id} className="break-words">{peer.name} — requested tab: {peer.tabName}</li>)}
          </ul>
        </div>
      )}
      {collision && (
        <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          Another event requests the same tab name. You can still save; the sheet will add “ (2)” (or the next available number).
        </p>
      )}

      <fieldset className="min-w-0 space-y-2" aria-describedby={`${id}-columns-hint`}>
        <legend className="text-sm font-semibold text-slate-800">Columns and totals</legend>
        <p className="text-xs text-slate-500">Keep at least one column selected. Totals are available for number questions without names and for sliders.</p>
        <div className="divide-y divide-slate-200 rounded-lg border border-slate-200">
          {choices.map(choice => {
            const last = choice.sent && sentCount === 1;
            const field = choice.field;
            const contactLabel = SHEET_BUILTIN_COLUMNS.find(c => c.key === choice.mergedInto)?.label;
            return (
              <div key={choice.key} className="min-w-0 space-y-2 p-3">
                <p className="break-words text-sm font-medium text-slate-700">{choice.label}</p>
                {choice.mergedInto ? (
                  <p className="text-xs text-slate-500">Shown in the {contactLabel} column. {choice.sent ? 'Follows that column’s selection.' : 'That column is not sent.'}</p>
                ) : (
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-600">
                    <label className="inline-flex items-center gap-2">
                      <input type="checkbox" className={checkbox} checked={choice.sent} disabled={last}
                        aria-label={`${choice.label}: Send to sheet`}
                        onChange={e => onChange({ googleSheetExclude: sheetColumnExclusions(event.form_schema, settings, choice.key, e.target.checked) })} />
                      Send to sheet
                    </label>
                    {field && canTotal(field) && (
                      <label className="inline-flex items-center gap-2">
                        <input type="checkbox" className={checkbox} checked={totals.includes(field.id)} disabled={!choice.sent}
                          aria-label={`${choice.label}: Total`}
                          onChange={e => onChange({ googleSheetTotals: e.target.checked ? [...new Set([...totals, field.id])] : totals.filter(key => key !== field.id) })} />
                        Total
                      </label>
                    )}
                    {last && <span className="text-slate-500">At least one column is required.</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p id={`${id}-columns-hint`} className="text-xs text-slate-500">
          Save changes to apply them to new submissions. Click Refresh Google Sheet to update rows already in the sheet.
          Unticked columns are cleared and hidden in the sheet; answers stay in the app.
        </p>
      </fieldset>
    </div>
  );
}
