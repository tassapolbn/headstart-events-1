# A separate Google spreadsheet for each event

Each event can copy its registrations (or survey responses) to its own Google
spreadsheet. The app remains the main record. This is a one-way, append-only
export: later changes, approvals, cancellations, check-ins, and deletions are not
reflected in rows already copied. Editing a sheet never changes the app.

## One-time setup by the school administrator

1. Open the existing Google Apps Script project used for confirmation emails.
   Keep `EmailRelay.gs` and its existing Script Properties. If the email relay
   has not been set up yet, follow its setup instructions for `SUPABASE_URL` and
   `SERVICE_ROLE_KEY`. The Sheets job uses those same credentials on Google's
   servers, even if you don't use confirmation emails.
2. Add a new script file named **GoogleSheets** and paste
   `apps-script/GoogleSheets.gs` into it.
3. In **Project Settings**, enable **Show appsscript.json manifest file in editor**.
   Add these two scopes to the existing `oauthScopes` array (keep the other scopes):
   - `https://www.googleapis.com/auth/spreadsheets`
   - `https://www.googleapis.com/auth/script.scriptapp`

   The repository's `apps-script/appsscript.json` includes the complete example.
4. Select **installGoogleSheetsSync** in the editor and click **Run**. Authorize
   it with the school Google account that will edit the spreadsheets. This
   installs one five-minute trigger; running it again does not add duplicates.
   Verify the `syncGoogleSheets` trigger appears under **Triggers**.
5. Deploy the updated website containing the Google Sheets event setting.
   No database migration is needed. The scheduled job runs the saved script
   code; it does not need a new web app URL or changes to email settings.

## Connect each event

1. Create a new blank Google spreadsheet, named for the event.
2. Give the Google account used in step 4 **Editor** access. Keep **General
   access** restricted and share only with the staff who need these records.
   The sheet URL is stored in event settings, which the public event API can
   read; Google sharing permissions, not secrecy of the URL, protect the data.
3. Open the event in the app, go to **Settings → Google Sheets**, paste its
   spreadsheet URL, and click **Save**. Use a different spreadsheet for every
   event. Copies and templates deliberately start without a sheet connection.
4. The job creates a **Registrations** tab. It imports existing submissions as
   well as new ones, including anonymous surveys, pending and waitlist entries.
   To check immediately, run **syncGoogleSheets** in the script editor.

The export includes registration ID, reference, submission time in UTC, event,
name, email, phone, booths, status at export, and one column per form question.
Multi-part answers are represented as text/JSON in their question's column.
Files show their names, and signatures show a notice to view them in the app;
private file URLs and signature images are not published. Answers longer than
49,000 characters are visibly truncated in the sheet; originals stay in the app.

## Reliability and spreadsheet editing

- The job checks every five minutes, processes up to ten events and 100
  registrations per event per run, and rotates through larger sets. Large
  imports or more than ten connected events require several runs.
- Each complete scan starts again. This catches missed submissions and retries
  failures without relying on the visitor keeping their browser open. Duplicate
  prevention uses the registration ID already written to the spreadsheet.
- A script lock prevents overlapping runs within this Apps Script project.
  Install syncing in only one project for this app.
- A spreadsheet is marked for one event and refuses data from another event,
  even if two events have the same name. Use a new blank spreadsheet rather
  than duplicating a previously connected Google spreadsheet.
- Keep the **Registrations** tab, its ID column, and header notes intact. Don't
  insert/delete columns or overwrite exported rows. Use other tabs for staff
  notes, formulas and reports. Adding form questions appends new columns;
  renaming/reordering questions preserves the original export headings and IDs.
- Failed events don't stop other events from syncing. In Apps Script, check
  **Executions** for errors such as missing edit access, changed headers, or
  Google quotas. Fix the problem; a later scan retries the same batch. Google
  Apps Script quotas and execution limits apply, so timing isn't guaranteed.
- To disconnect, clear the event's Sheet link and save. Existing spreadsheet
  data is retained; an already-running batch may finish. Changing the link
  imports all submissions into the new spreadsheet.

## Verification after setup

Use a test event and a restricted blank spreadsheet. Save the link, submit one
registration, then run `syncGoogleSheets`. Confirm the answers and reference
appear once. Run it again and confirm there is no duplicate. Disable event
emails and submit another registration: it must still export. Connect a second
test event to a different spreadsheet and confirm that the records stay separate.
Check **Executions** after the first scheduled run.

Local automated tests simulate Apps Script/Sheets and the database responses;
they cannot verify your Google permissions, deployed code or live credentials.
