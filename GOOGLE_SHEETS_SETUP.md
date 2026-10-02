# A separate Google spreadsheet for each event

The app copies a new registration or survey response to that event's own spreadsheet. Sheets updates happen only after a submission or when an admin clicks **Refresh Google Sheet**. There is no scheduled sheet polling, background scan or database trigger.

The app remains the main record. Refresh imports missed submissions and updates existing answers and statuses. It does not delete exported rows when records are deleted from the app. Editing a sheet never changes the app.

## One-time setup or upgrade

1. Open the school's existing Google Apps Script email relay project. Replace the entire `EmailRelay.gs` with the current repository version, including its generated email renderer at the end. Add or replace `GoogleSheets.gs` from `apps-script/GoogleSheets.gs`.
2. Keep the existing Script Properties: `SUPABASE_URL`, `SERVICE_ROLE_KEY` and `FROM_NAME`. If this is a new installation, follow the setup at the top of `EmailRelay.gs`. The service key stays in Google's Script Properties; never place it in the website or a spreadsheet.
3. In Project Settings, show the manifest file. Use the scopes in `apps-script/appsscript.json`, retaining any additional scopes your project needs. Sheets needs `https://www.googleapis.com/auth/spreadsheets`; removing old sheet triggers needs `https://www.googleapis.com/auth/script.scriptapp`.
4. Select **installGoogleSheetsSync**, click **Run** and authorize with the school's Google account. Despite its historical name, this function now REMOVES the former sheet-sync timer. It never installs a timer. Existing unrelated triggers, such as an optional email summary, are preserved. Confirm there is no `syncGoogleSheets` entry under Triggers. Even a stale sheet trigger does no work with the new code.
5. Choose **Deploy > Manage deployments > Edit > New version > Deploy** for the existing web app. Execute as the school account, with access set to Anyone, as required for public registration submissions. Reuse its `/exec` URL in the app's campus or global Relay web app URL setting. Saving script files alone does not update an existing deployment.
6. Deploy the updated website. No database migration, Supabase Edge Function, Realtime subscription or scheduled database job is needed.

Manual refresh verifies the signed-in user's session with Supabase and requires the existing server-controlled `app_metadata.role` to be `owner` or `staff`. A role in user-editable metadata does not grant access. Legacy staff accounts without a server role must be assigned one through the app's account management before refreshing.

## Connect each event

1. Create a new blank spreadsheet for the event. Give the Google account that runs the script **Editor** access.
2. Keep General access **Restricted** and share only with staff who need the records. Event settings expose the sheet URL publicly; Google sharing permissions protect the contents.
3. In the app, open **Event > Settings > Google Sheets**, paste the spreadsheet URL, and **Save**. Use a different spreadsheet for each event. Duplicated events and templates start without a sheet link.
4. Click **Refresh Google Sheet** in Settings or Registrations to import existing responses. A new tab shows the actual result or error; allow pop-ups if asked. Large events may show **Continue refresh**. Click it for the next batch; nothing continues automatically.
5. Submit a test response. The registration relay adds its row, even when confirmation and admin emails are both disabled. The relay must still be configured.

The script creates a managed **Registrations** tab. It exports ID, reference, submission time (UTC), event, contact details, booths, status and answers. Anonymous surveys, pending registrations and waitlist entries are included. Files show names and signatures show a notice to view them in the app. Private file links and signature images are not exposed. Answers over 49,000 characters are marked as truncated; originals stay in the app.

## Performance and recovery

- A submission reuses the registration and event lookup already used by the email relay. Sheets adds no extra database lookup to that request. With emails disabled, it makes the single lookup needed to export the saved registration.
- Merely viewing or editing a form does not sync its sheet. Refresh reads only the chosen event, in bounded pages. Approvals, edits and cancellations appear in Sheets after the next admin refresh.
- The public submission makes a best-effort relay request. A closed browser, connection failure, busy script or Google quota can leave a saved registration missing from Sheets. Use Refresh to recover it. There are deliberately no automatic retries or periodic recovery scans.
- A script lock and registration IDs prevent duplicates within this script project. Use one relay project for this app. A sheet refuses records belonging to a different event.
- Keep the managed tab, ID column and header notes intact. Use separate tabs for notes, formulas and reports. Refresh overwrites managed row contents. Adding questions adds columns; renaming, reordering or changing their type preserves their IDs and original export headings. Deleted questions retain their stored answer columns.
- To disconnect, clear the event's sheet link and save. Existing sheet data is retained; an already-running request may finish. A new blank destination can be populated using Refresh.
- Check Apps Script **Executions** if a row does not arrive. Correct access, configuration or quota problems before refreshing.

## Verify after setup

Use a test event and restricted blank spreadsheet. Submit a response with emails off and confirm one row arrives. Click Refresh twice and confirm there are no duplicates. Change an answer or status in the app, click Refresh and confirm the row updates. Test another event with another spreadsheet and confirm separation. With no submissions or refresh clicks, there should be no sheet-sync executions.

Automated tests simulate Apps Script, Sheets and database responses. Live Google permissions, deployment and school credentials still need this setup check.

Google's deployment and POST parameter documentation: https://developers.google.com/apps-script/guides/web
