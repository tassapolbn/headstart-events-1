# Google Sheets: one tab per event

Several events can use the same spreadsheet. Each event has its own managed tab, with a requested name, selected columns and optional totals. New registrations and survey responses are exported when submitted, even with emails off. **Refresh Google Sheet** imports missed rows and updates existing answers and statuses. Nothing syncs on a timer or merely because someone views a form.

The app remains the main record. Editing a sheet never changes the app. Exported rows are archival: deleting a registration from the app does not delete its sheet row.

## One-time setup or upgrade

1. Open the school's existing Google Apps Script email relay project. Replace the entire `EmailRelay.gs` (or `Code.gs` if you kept its original name) with `apps-script/EmailRelay.gs`, including the generated email renderer at the end. Add or replace the **GoogleSheets.gs** file with all of `apps-script/GoogleSheets.gs` in the same project.
2. Keep the existing Script Properties: `SUPABASE_URL`, `SERVICE_ROLE_KEY` and `FROM_NAME`. For a new installation, follow the setup at the top of `EmailRelay.gs`. The service key stays in Google's Script Properties; never place it in the website or a spreadsheet.
3. In Project Settings, show the manifest file. Use the scopes in `apps-script/appsscript.json`, retaining any additional scopes your project needs. Sheets needs `https://www.googleapis.com/auth/spreadsheets`; removing old sheet triggers needs `https://www.googleapis.com/auth/script.scriptapp`.
4. Select **installGoogleSheetsSync**, click **Run** and authorize with the school's Google account. This removes the former sheet-sync timer and never installs a timer. Unrelated triggers, such as an optional email summary, are preserved. Confirm there is no `syncGoogleSheets` entry under Triggers. Even a stale sheet trigger does no work with the new code.
5. Choose **Deploy > Manage deployments > Edit > New version > Deploy** for the existing web app. Execute as the school account, with access set to **Anyone**, as required for public registration submissions. Reuse its `/exec` URL in the app's campus or global Relay web app URL setting. Saving script files alone does not update the deployment. Opening `/exec` should report version **2026-10-24-sheets**.
6. Deploy the updated website. No database migration, Supabase Edge Function, Realtime subscription or scheduled database job is needed.

Manual refresh verifies the signed-in user's session with Supabase and requires the server-controlled `app_metadata.role` to be `owner` or `staff`. A role in user-editable metadata does not grant access. Assign legacy staff accounts a server role through the app's account management before refreshing.

## Connect an event and choose its tab

1. Create a blank spreadsheet or choose an existing one. Give the Google account that runs the relay **Editor** access. A new spreadsheet's first tab uses the account's language: Thai accounts commonly get **ชีต1**, not **Sheet1**. A single completely blank tab can be reused regardless of its name. Unclaimed tabs containing data are left alone; the script creates another tab.
2. Keep General access **Restricted** and share only with staff who need the records. Event settings expose the sheet URL publicly; Google sharing permissions protect the contents. Sharing a spreadsheet grants access to its event tabs, so use separate files when events need different audiences. Hidden columns are not a privacy boundary.
3. Open **Event > Settings > Google Sheets**, paste the spreadsheet URL and optionally enter a **Requested tab name**. For example, two events can request **Friday Market 6 Nov** and **Friday Market 2 Oct** in the same file. Blank uses the event name. Duplicated events and templates start without a sheet URL or requested tab name; their column and total choices are retained.
4. The settings card lists other visible events using the same file. A matching requested name shows a warning but does not block saving. The script adds “ (2)”, “ (3)”, and so on when a name is already taken, ignoring case. Names are limited to 100 characters; unsupported characters may be replaced. A manual rename in Google Sheets is kept until the requested name in the app changes (or, when blank, the event name changes).
5. **Save** the event, then click **Refresh Google Sheet** in Settings or Registrations. This creates the event tab immediately, even with no registrations. A browser tab shows the result or error and links directly to the event's sheet tab. Allow pop-ups if asked. Large events may show **Continue refresh**; click it to process the next batch. Nothing continues automatically.
6. Submit a test response and confirm one row arrives. The relay must be configured even when both confirmation and admin emails are disabled.

## Columns, contact details and totals

In **Columns and totals**, use **Send to sheet** to choose reference, submission time (UTC), contact details, booths, status and individual answers. Keep at least one column selected; Registration ID is always retained and hidden. Headings, pictures and other content-only blocks are not answer columns.

Unticked columns are cleared and hidden when the next submission or refresh reconciles the tab. This also clears their cells in archived rows; the answers remain in the app for registrations that still exist. Columns are never deleted or moved. Re-including a column shows it again, but click **Refresh Google Sheet** to refill older rows. Deleted registrations cannot be refilled. Newly added columns that are being sent also need a refresh for older rows; the summary shows a reminder until a refresh started after the change completes.

Contact questions are combined with Name, Email or Phone only when the source is unambiguous. The contact column uses the question's wording, and the question row in settings says **Shown in the Email column** (or Name/Phone). Both follow the contact column's checkbox. Ambiguous mappings stay separate. Missing conditional answers keep the registration's existing contact value. When the two values differ, the cell preserves both, with the question's value on a line starting **Form answer:**. Matching email case, phone punctuation, or name spacing does not create a duplicate. Old duplicate question columns are folded into their contact column and hidden; their answers continue to be maintained so un-merging can show them again without a refresh.

Select **Total** for plain number questions that do not collect names, or for sliders. Numbers that collect names and repeating-details questions are not totalable. Total is disabled while a question is not sent. Only opting into a total switches the answer column to numeric cells and converts existing strict numeric text in place, including archived rows. Other answers stay text. Values such as `3 tickets` are not numbers and are ignored by the total; no display text is parsed to guess a count. Turning a total off removes its formula; already-converted numbers remain, while new submissions use text again.

The total uses **SUBTOTAL**, so it follows the sheet filter. Filter **Status** to exclude cancelled or rejected rows when needed; these statuses are not automatically excluded. Integer data uses `#,##0`; decimal data uses `#,##0.0#########`. Totals start with `#,##0`; once a decimal value is exported or found during numeric conversion, the column retains `#,##0.0#` for its total, even if later edits leave only integers. This avoids rescanning older rows on every submission. Do not use `#,##0.##`, which can display a trailing decimal point for whole numbers.

## What the tab looks like

- **Row 1:** the event name, once, in a navy title band.
- **Row 2:** event date, time and location, plus an Updated timestamp in the script's time zone. The event date is formatted in UTC to keep the saved calendar date.
- **Row 3:** the registration/response count and chosen totals, on pale gold. Filtering changes the count to show how many rows are visible. The label uses a visible column that is not a total; it is omitted if every visible column is a total.
- **Row 4:** the column headings, white on navy with a gold rule. Rows through the header are frozen. Existing valid headers below row 4 are also supported; the summary sits immediately above the header.
- **Row 5 onward:** the records, with alternating row colours and status colours. Column A contains the hidden Registration ID used to prevent duplicates. The filter extends to the tab's available rows and preserves column criteria when it grows.

Anonymous surveys, pending registrations and waitlist entries are included. Files show names and signatures show a notice to view them in the app; private links and signature images are not exposed. Repeating details use readable lines, quantities show item counts, grids show row/column answers, and booleans show Yes/No. Long text is marked as truncated near the cell limit; full answers stay in the app. Formula-like input is escaped as literal text.

## Upgrade an already-connected sheet

After replacing both script files and deploying a new version, **click Refresh Google Sheet once for each connected event**. A valid old **Registrations** tab is adopted using its existing ownership marker. Its header notes are validated before anything is claimed or moved. An invalid header produces an error without changing the tab; restore the notes before retrying.

For the old row-1 layout, three rows are inserted above the header, preserving the existing records. The legacy Event column is hidden, duplicate contact answers are folded into contact cells, and selected numeric totals convert existing numeric text in place. This includes rows whose registration no longer exists in the app. The tab becomes the event name, or its requested name, subject to name collisions. Other tabs' formulas keep their column positions; Google Sheets adjusts references for inserted rows and tab renames.

Do not copy a claimed event tab and keep both copies in the same spreadsheet. A duplicate claim stops the export and names the conflicting tabs; remove the unwanted copy, then refresh.

## Ownership, refresh and recovery

Everything on an event's managed tab is app-owned: title, details, summary/totals, headings and managed columns below them. Refresh overwrites managed rows; presentation is reapplied on each registration write and once per refresh request. **Keep staff notes, formulas and reports on other tabs.** Keep the ID column and header notes intact. Adding questions appends columns; changing question order does not move existing columns. Labels follow current wording. Answers of deleted questions keep their column; staff can delete such a column in Google Sheets if it is no longer wanted, and it will not be recreated. A deleted question previously merged into Name, Email or Phone stays hidden with that contact column and is cleared when that contact unit is excluded, including archived rows.

Rows are archival. Deleting a registration from the app does not remove its sheet row, and refresh cannot update that row from the database. Excluding a column can still clear its archived cells, and migrations can fold contacts or convert exact numeric text already stored there. Use the Status filter when calculating totals for current participants.

A refresh run is saved on its destination tab. **Continue refresh** resumes only the matching run with the same export settings and schema. If the destination, run or formatting changes, continuation starts again from the beginning and reports the restart; registration IDs prevent duplicate rows. Clicking Refresh in the app always starts a fresh run. Older Continue forms also start a new run. A successful complete run clears an older refresh-needed reminder; a run started before that change cannot clear it.

A submission reuses the registration and event already fetched by the email relay; Sheets adds no database reads to that path. Refresh reads only the chosen event in bounded pages. Approvals, answer edits and cancellations appear in Sheets after an admin refresh. A closed browser, connection failure, busy script or Google quota can leave a saved registration missing from Sheets. Refresh recovers it; there are no automatic retries or periodic scans. Use one relay project for this app so its lock can prevent overlapping writes.

To disconnect, clear the sheet link and save. Existing sheet data is retained; an already-running request may finish. A new destination can be populated with Refresh. Check Apps Script **Executions** for access, configuration or quota errors. Styling failures are logged and do not stop rows being exported.

## Verify after setup

Use test events and a restricted spreadsheet:

1. Refresh an event with no registrations. Confirm its requested tab is created, with title/details, a row-4 header, frozen rows and hidden ID. Confirm a blank **ชีต1** or other localized first-tab name is handled.
2. Submit with emails off. Confirm one row arrives; refresh twice and confirm no duplicates. Change an answer and status in the app, refresh, and confirm both update.
3. Connect another event to the same spreadsheet. Confirm separate requested tabs; try a matching name and confirm the warning and numbered suffix. Rename a tab in Sheets, confirm it is kept, then change the app's requested name and confirm that rename applies.
4. Choose a plain number total. Include integer, decimal and nonnumeric answers. Confirm number formatting, the total and the summary count; filter Status and confirm totals/counts follow the visible rows with ID still hidden.
5. Untick a column, save and refresh. Confirm its cells are cleared and the column hidden, while the app still has the answers. Re-include it, confirm the reminder, and refresh again to fill live registrations and clear the reminder. The last selected optional column must remain selected.
6. Upgrade a valid old connected sheet. Confirm rows survive, three rows are inserted, Event is hidden, the tab is renamed, duplicate contacts are combined and selected totals include archived numeric text. Refresh once to update current records.
7. If a refresh needs Continue, change an export setting, save, and continue the old request. Confirm it restarts safely. With no submissions or refresh clicks, there should be no sheet-sync executions.

Automated tests simulate Apps Script, Sheets and database responses. Live permissions, deployment and school credentials still need this setup check. Google's deployment and POST parameter documentation: https://developers.google.com/apps-script/guides/web

## Staff columns beside the export

You can add your own columns to the right of the last exported column, with headers on the same header row. Examples: `Shirt collected` (Insert > Checkbox), `Staff status`, and `Note`. Refresh updates only the HeadStart columns and retains staff values, formulas, notes, validation, and formatting. Use the full table filter when sorting so staff entries stay with the same registration.

When new questions or additional child entries require more exported columns, the script inserts them before the staff columns; Google Sheets moves the staff columns intact. Checkboxes prefilled down the sheet do not cause new registrations to skip empty rows.

Keep custom columns at the right edge, not between managed columns. Do not copy the `headstart:` header notes into custom headers or remove them from system columns. Custom headers may have ordinary notes. Install the latest `GoogleSheets.gs` and deploy a new Apps Script version before using this feature.
