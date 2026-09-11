# HeadStart Events Registration Platform

A complete event registration and management system for HeadStart International School Phuket. It replaces Google Forms with a branded, mobile friendly platform featuring an interactive floor plan with real time booth booking, a drag and drop form builder, reusable event templates, automatic confirmation emails, QR code check in, printable vendor signs and an analytics dashboard.

Built with React, Vite, TypeScript, Tailwind CSS, React Hook Form, Zod and Framer Motion on the frontend, Supabase (PostgreSQL, Auth, Storage, Realtime) as the backend, and deployed as a static site on Netlify. Confirmation emails are sent through a small Google Apps Script relay from your school Gmail account, so there is no extra email service to pay for.

A Thai language quick start guide is in `SETUP_GUIDE_TH.md`.

---

## 1. What you need

- A free account at https://supabase.com
- A free account at https://app.netlify.com
- Your Google account (for the email relay)
- Node.js 18 or newer if you want to run the project on your own computer

## 2. Set up Supabase (about 10 minutes)

1. Create a new Supabase project. Choose the Singapore region for the best speed from Phuket. Save the database password somewhere safe.
2. In the dashboard, open **SQL Editor**, click **New query**, paste the entire contents of `supabase/schema.sql` and press **Run**. This creates every table, security rule, storage bucket and database function the app needs.
3. Create your admin account: **Authentication -> Users -> Add user -> Create new user**. Enter your email and a strong password and tick **Auto confirm user**.
4. Turn off public sign ups so only you can log in: **Authentication -> Sign In / Up -> disable "Allow new users to sign up"**.
5. Copy your keys from **Project Settings -> API**:
   - Project URL, for example `https://abcd1234.supabase.co`
   - `anon` public key

## 3. Deploy to Netlify (about 5 minutes)

Option A, with GitHub (recommended, gives automatic updates):
1. Push this folder to a GitHub repository.
2. In Netlify choose **Add new site -> Import an existing project**, pick the repository.
3. Netlify reads `netlify.toml` automatically (build command `npm run build`, publish folder `dist`).
4. Before deploying, open **Site configuration -> Environment variables** and add:
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon public key
5. Deploy. Your platform is now live at `https://your-site.netlify.app`.

Option B, drag and drop:
1. On your computer run `npm install`, create a `.env` file from `.env.example` with your two keys, then run `npm run build`.
2. Drag the generated `dist` folder onto the Netlify dashboard.

## 4. Set up the email relay (about 5 minutes)

Follow the step by step instructions at the top of `apps-script/EmailRelay.gs`. In short: create a new Apps Script project, paste the file, add the three Script Properties (including the Supabase `service_role` key, which stays safely inside Apps Script), deploy as a web app with access set to Anyone, then paste the web app URL into **HeadStart Events -> Settings -> Relay web app URL**.

The relay also supports an optional daily summary email: add a time driven trigger for the `dailySummary` function. Each form's summary goes only to that form's notification recipients.

### Choose notification recipients for each form

1. Open **Events → select the event → Email**.
2. Under **Registration notifications for this form**, turn on **Notify this form's admins about new registrations**.
3. Enter the responsible admins in **Notification recipients**, one email per line (commas and semicolons also work), then **Save**. Duplicate addresses are removed and invalid addresses must be corrected before saving.
4. Repeat for each form. An empty list sends no admin notifications. Turning notifications off keeps the list for later. Registrant confirmation emails have their own independent switch.

Campus Settings contains **Email relay test recipients** for testing delivery only; it does not subscribe those addresses to registrations or daily summaries.

### Updating an existing installation

Deploy the frontend and replace the code in your existing Apps Script project with `apps-script/EmailRelay.gs`. In Apps Script choose **Deploy → Manage deployments → Edit → Version: New version → Deploy** to keep the same web app URL. Update each relay project if campuses use separate deployments. Updating the website alone will not change email routing.

No database migration is needed: recipient lists are saved in the existing `events.email_template` JSON. Any existing form-specific `adminEmail` is retained until its recipient list is edited. Campus-wide recipients are no longer used automatically, so assign recipients to every form that needs notifications. Duplicating an event or using a template copies its recipient list; review that list for the new form.

After both deployments, register once on each of two forms with different assigned admins and confirm that each admin receives only their own form's alert. The existing campus test button checks delivery, not form routing.

## 5. First steps in the app

1. Open `https://your-site.netlify.app/admin` and sign in.
2. Go to **Settings**, set the school name, upload the school logo, enter the relay test recipients and the relay URL, then save.
3. Create your first event, build the form (or press "Insert vendor questions"), design the floor plan, adjust the theme, review the email template and assign the form's notification recipients in **Email**, then set the status to **Open** and save.
4. Share the public link (Copy link button on the Events page). No login is needed for parents or vendors.

## 6. How booth locking works

Booth availability updates live on every open registration page through Supabase Realtime. The actual booking happens inside a single database transaction (`submit_registration`) that locks the booth row, and a unique database index guarantees that at most one active registration can ever hold a booth. Two vendors can press Submit at the same moment and only one will get the booth; the other instantly sees a friendly message asking them to pick another.

## 7. Security notes

- Administrator pages require Supabase authentication. Public visitors never need an account.
- The public (anon) key can only read published events and visible booths, and can only write through the guarded `submit_registration` function. Row Level Security blocks everything else.
- Spam protection: hidden honeypot field, minimum completion time, duplicate email blocking per event, and server side email validation.
- Vendor documents are stored in a private bucket; admins view them through short lived signed links.
- The Supabase `service_role` key lives only in Apps Script Script Properties, never in the website code.

## 8. Project structure

```
src/
  components/    form-builder, form-renderer, floor-plan, email, theme, policies, registrations, ui
  context/       authentication and toast notifications
  hooks/         useEvent, useAppSettings
  lib/           types, defaults, theme, merge fields, storage, exports, event operations
  pages/admin/   dashboard, events, editor tabs, registrations, analytics, check in, signs, templates, settings
  pages/public/  event page, success page, lookup, home
supabase/        schema.sql (run once in the SQL editor)
apps-script/     EmailRelay.gs and appsscript.json (email sending)
```

## 9. Extending the platform

The architecture is modular by design. New modules (volunteer registration, parent teacher booking, equipment booking, payments and so on) follow the same pattern: add a table plus Row Level Security in Supabase, a folder under `src/components`, and a route in `src/App.tsx`. The form builder, theming, QR and email systems are all reusable as is.

## 10. Troubleshooting

Run `npm test` for notification routing regression tests and `npm run build` for TypeScript and production build validation.

- Blank page after deploy: check the two environment variables on Netlify, then redeploy.
- Sign in fails: confirm the user exists in Supabase Authentication and was auto confirmed.
- No confirmation emails: open Settings and press "Send a test email"; check the Apps Script execution log; confirm the three Script Properties.
- Booth map not showing publicly: the floor plan toggle must be on, the event saved, and at least one booth drawn and saved.
- Changed the form after registrations arrived: old answers are kept and matched by question, new questions simply show empty for old rows.
