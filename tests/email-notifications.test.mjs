import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../apps-script/EmailRelay.gs', import.meta.url), 'utf8');
const helpers = { exports: {} };
vm.runInNewContext(ts.transpileModule(
  readFileSync(new URL('../src/lib/notificationEmails.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
).outputText, helpers);
const { notificationEmailEntries, normalizeNotificationEmails, invalidNotificationEmails, wantsRelayEmail } = helpers.exports;
const plain = (value) => JSON.parse(JSON.stringify(value));

test('registration relay exports with email off, and sheet failures never block confirmation', () => {
  const anon = registration('SHEET', { enabled: false, adminNotify: false });
  anon.email = null;
  const r = relay([anon]);
  const exported = [];
  r.ctx.syncRegistrationToSheet = row => exported.push(row.id);
  r.post({ reference: anon.reference });
  r.post({ reference: anon.reference });
  assert.deepEqual(exported, ['SHEET']); assert.equal(r.mail.length, 0);
  const normal = relay([registration('NORMAL')]);
  normal.ctx.syncRegistrationToSheet = () => { throw new Error('Google unavailable'); };
  normal.ctx.console = { error: () => {} };
  normal.post({ reference: 'HS-normal' });
  // References are case-normalized by the relay.
  normal.ctx.fetchRegistration = () => registration('NORMAL');
  normal.post({ reference: 'HS-normal' });
  assert.equal(normal.mail.length, 1);
});

test('manual refresh routes before registration/email work and sends nothing', () => {
  const r = relay([]);
  r.ctx.sheetRefreshPage = payload => ({ result: 'refreshed', id: payload.eventId });
  const result = r.ctx.doPost({ parameter: { request: JSON.stringify({ action: 'google_sheet_refresh', eventId: 'chosen' }) } });
  assert.equal(result.id, 'chosen'); assert.equal(r.mail.length, 0); assert.deepEqual(r.requests, []);
});

function registration(id, template = {}) {
  return {
    id, reference: `HS-${id}`, name: `Guest ${id}`, email: `guest${id}@example.com`,
    status: 'confirmed',
    events: { id, name: 'Same form name', campus_id: 'hsc', email_template: template },
  };
}

function relay(rows) {
  const mail = [], marked = [], requests = [];
  const cache = new Map();
  const ctx = vm.createContext({
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) },
    MailApp: { sendEmail: (options) => mail.push(options) },
    CacheService: { getScriptCache: () => ({ get: (key) => cache.get(key), put: (key, value) => cache.set(key, value) }) },
    // Needed once a form carries a date: the merge map formats it, and a
    // registration attaches a calendar file built from it.
    Utilities: {
      formatDate: (date) => new Date(date).toISOString().slice(0, 10),
      newBlob: (content, type, name) => ({ content, type, name }),
    },
    Session: { getScriptTimeZone: () => 'UTC' },
  });
  vm.runInContext(source, ctx);
  // Kept before the stub below replaces it, for the tests that read the real email.
  const realBuildEmailHtml = ctx.buildEmailHtml;
  ctx.jsonOut = (value) => plain(value);
  ctx.fetchRegistration = (reference) => rows.find((r) => r.reference === reference);
  ctx.fetchCampus = () => ({ id: 'hsc', name: 'Campus', notify_emails: ['all-admins@example.com'] });
  ctx.fetchAppSettings = () => ({ admin_email: 'global@example.com' });
  ctx.buildEmailHtml = () => '<p>Confirmation</p>';
  ctx.markEmailSent = (id) => marked.push(id);
  ctx.supabaseGet = (path) => { requests.push(path); return rows; };
  const post = (payload) => ctx.doPost({ postData: { contents: JSON.stringify(payload) } });
  return { ctx, mail, marked, requests, post, realBuildEmailHtml };
}

test('a registration notifies only its assigned admins, with one confirmation', () => {
  const r = relay([
    registration('A', { adminEmails: [' A@example.com ', 'a@example.com', 'backup@example.com'] }),
    registration('B', { adminEmails: ['b@example.com'] }),
  ]);
  assert.equal(r.post({ reference: 'HS-A', adminEmails: ['injected@example.com'] }).ok, true);
  assert.deepEqual(r.mail.map((m) => m.to), ['guestA@example.com', 'a@example.com,backup@example.com']);
  assert.deepEqual(r.marked, ['A']);
  assert.equal(r.post({ reference: 'HS-B' }).ok, true);
  assert.deepEqual(r.mail.slice(2).map((m) => m.to), ['guestB@example.com', 'b@example.com']);
});

test('empty or missing recipients never fall back to campus or global lists', () => {
  for (const template of [{}, { adminEmails: [] }, { adminEmails: [], adminEmail: 'old@example.com' }]) {
    const r = relay([registration('A', template)]);
    r.post({ reference: 'HS-A' });
    assert.deepEqual(r.mail.map((m) => m.to), ['guestA@example.com']);
  }
});

test('legacy form addresses are retained only until an explicit list is saved', () => {
  const r = relay([registration('A', { adminEmail: ' Legacy@example.com ' })]);
  r.post({ reference: 'HS-A' });
  assert.equal(r.mail[1].to, 'legacy@example.com');
  assert.deepEqual(plain(notificationEmailEntries({ adminEmail: 'old@example.com' })), ['old@example.com']);
  assert.deepEqual(plain(notificationEmailEntries({ adminEmails: [], adminEmail: 'old@example.com' })), []);
});

test('admin notifications work with confirmations off or a registrant without email', () => {
  for (const confirmation of [true, false]) {
    const reg = registration('A', { enabled: confirmation, adminEmails: ['a@example.com'] });
    if (confirmation) reg.email = null;
    const r = relay([reg]);
    assert.equal(r.post({ reference: 'HS-A' }).ok, true);
    assert.deepEqual(r.mail.map((m) => m.to), ['a@example.com']);
  }
});

test('disabling admin notifications preserves confirmations and sends no summaries', () => {
  const r = relay([registration('A', { adminNotify: false, adminEmails: ['a@example.com'] })]);
  r.post({ reference: 'HS-A' });
  r.ctx.dailySummaryForCampus({ id: 'hsc' });
  assert.deepEqual(r.mail.map((m) => m.to), ['guestA@example.com']);
});

test('when both email options are off nothing is sent or marked', () => {
  const r = relay([registration('A', { enabled: false, adminNotify: false })]);
  assert.equal(r.post({ reference: 'HS-A' }).skipped, 'no recipients');
  assert.equal(r.mail.length, 0);
  assert.equal(r.marked.length, 0);
});

test('cooldown and already-sent guards still prevent duplicate delivery', () => {
  const row = registration('A', { adminEmails: ['a@example.com'] });
  const r = relay([row]);
  r.post({ reference: row.reference });
  assert.equal(r.post({ reference: row.reference }).skipped, 'cooldown');
  assert.equal(r.mail.length, 2);
  const sent = relay([{ ...row, email_sent_at: '2026-09-11T00:00:00Z' }]);
  assert.equal(sent.post({ reference: row.reference }).skipped, 'already sent');
  assert.equal(sent.mail.length, 0);
});

test('daily summaries isolate forms even with identical names and no campus recipients', () => {
  const r = relay([
    registration('A', { adminEmails: ['a@example.com'] }),
    registration('B', { adminEmails: ['b@example.com'] }),
    registration('C', { adminEmails: [] }),
  ]);
  r.ctx.dailySummaryForCampus({ id: 'hsc', notify_emails: [] });
  assert.deepEqual(r.mail.map((m) => m.to), ['a@example.com', 'b@example.com']);
  assert.match(r.mail[0].htmlBody, /HS-A/);
  assert.doesNotMatch(r.mail[0].htmlBody, /HS-B|HS-C/);
  assert.match(r.mail[1].htmlBody, /HS-B/);
  assert.doesNotMatch(r.mail[1].htmlBody, /HS-A|HS-C/);
  assert.match(r.requests[0], /events!inner\(id,name,campus_id,email_template\)/);
});

test('frontend validation and relay filtering agree on normalized recipients', () => {
  const entries = [' Admin@example.com ', 'admin@example.com', '', 'bad', 'x@example.com,y@example.com', 'second@example.com'];
  assert.deepEqual(plain(invalidNotificationEmails(entries)), ['bad', 'x@example.com,y@example.com']);
  const valid = normalizeNotificationEmails(entries).filter((email) => !invalidNotificationEmails([email]).length);
  const r = relay([]);
  assert.deepEqual(plain(r.ctx.formNotifyList({ adminEmails: entries })), plain(valid));
  assert.deepEqual(plain(r.ctx.formNotifyList({ adminEmails: [null, 123] })), []);
});

test('campus test emails continue to work without including registration data', () => {
  const r = relay([]);
  assert.equal(r.post({ test: true, campus: 'hsc' }).ok, true);
  assert.deepEqual(r.mail.map((m) => m.to), ['all-admins@example.com']);
  assert.match(r.mail[0].subject, /test email/);
});

// ---------------------------------------------------------------------------
// Survey, questionnaire and feedback forms.
// The relay treats these differently from event registrations, and that
// behaviour had no coverage, so a rewrite of the recipient logic could have
// quietly undone it.
// ---------------------------------------------------------------------------

function surveyRegistration(id, template = {}, patch = {}) {
  const row = registration(id, template);
  row.events.settings = { formType: 'survey' };
  return { ...row, ...patch, events: { ...row.events, ...(patch.events ?? {}) } };
}

test('an anonymous survey response still reaches the form owners', () => {
  const r = relay([surveyRegistration('A', { adminEmails: ['owner@example.com'] }, { email: null, name: null })]);
  assert.equal(r.post({ reference: 'HS-A' }).ok, true);
  // Nothing to confirm to, but the owners are told.
  assert.deepEqual(r.mail.map((m) => m.to), ['owner@example.com']);
  assert.match(r.mail[0].subject, /^New response: /);
  assert.match(r.mail[0].htmlBody, /Anonymous/);
  // Response notices never carry registration-only fields.
  assert.doesNotMatch(r.mail[0].htmlBody, /Phone|Booth|Status|registered for/);
  assert.deepEqual(r.marked, ['A']);
});

test('a survey response with an email gets a thank you and no calendar file', () => {
  const r = relay([surveyRegistration('A', { adminEmails: ['owner@example.com'], attachCalendar: true }, {
    events: { id: 'A', name: 'Parent Feedback', campus_id: 'hsc', settings: { formType: 'survey' }, event_date: '2026-10-02', email_template: { adminEmails: ['owner@example.com'], attachCalendar: true } },
  })]);
  r.post({ reference: 'HS-A' });
  assert.deepEqual(r.mail.map((m) => m.to), ['guestA@example.com', 'owner@example.com']);
  // A survey is not an event, so no .ics rides along even with a date set.
  assert.equal(r.mail[0].attachments, undefined);
});

test('surveys route by form too, never to the campus list', () => {
  const r = relay([surveyRegistration('A', { adminEmails: [] }, { email: null })]);
  assert.equal(r.post({ reference: 'HS-A' }).skipped, 'no recipients');
  assert.equal(r.mail.length, 0);
  assert.equal(r.marked.length, 0);
});

test('registration notices keep their own wording and fields', () => {
  const r = relay([registration('A', { adminEmails: ['owner@example.com'] })]);
  r.post({ reference: 'HS-A' });
  assert.match(r.mail[1].subject, /^New registration: /);
  assert.match(r.mail[1].htmlBody, /registered for/);
  for (const field of ['Phone', 'Booth', 'Status']) assert.match(r.mail[1].htmlBody, new RegExp(field));
});

test('a dated registration still attaches its calendar file', () => {
  // The contrast that makes the survey assertion above meaningful: the
  // mechanism works, surveys simply switch it off.
  const row = registration('A', { adminEmails: ['owner@example.com'], attachCalendar: true });
  row.events.event_date = '2026-10-02';
  row.events.slug = 'friday-market';
  row.events.email_template = { adminEmails: ['owner@example.com'], attachCalendar: true };
  const r = relay([row]);
  r.post({ reference: 'HS-A' });
  assert.equal(r.mail[0].attachments.length, 1);
  assert.equal(r.mail[0].attachments[0].name, 'friday-market.ics');
  assert.equal(r.mail[0].attachments[0].type, 'text/calendar');
});

test('the public page calls the relay whenever either email is wanted', () => {
  // The gate that decides whether the relay is called at all. It used to be
  // "confirmation enabled" for registrations, so turning the confirmation off
  // silently stopped the staff notice too and the relay was never reached.
  assert.equal(wantsRelayEmail({ enabled: true, adminNotify: true }), true);
  assert.equal(wantsRelayEmail({ enabled: true, adminNotify: false }), true);
  assert.equal(wantsRelayEmail({ enabled: false, adminNotify: true }), true);
  assert.equal(wantsRelayEmail({ enabled: false, adminNotify: false }), false);
  assert.equal(wantsRelayEmail(undefined), false);

  // And the relay agrees: notice only, with the confirmation switched off.
  const r = relay([registration('A', { enabled: false, adminEmails: ['owner@example.com'] })]);
  r.post({ reference: 'HS-A' });
  assert.deepEqual(r.mail.map((m) => m.to), ['owner@example.com']);
});

// ---------------------------------------------------------------------------
// Relay review, October 2026.
// ---------------------------------------------------------------------------

test('a resend repeats the confirmation only, without a second staff notice', () => {
  const sent = { ...registration('A', { adminEmails: ['owner@example.com'] }), email_sent_at: '2026-09-30T00:00:00Z' };
  const r = relay([sent]);
  assert.equal(r.post({ reference: 'HS-A', resend: true }).ok, true);
  assert.deepEqual(r.mail.map((m) => m.to), ['guestA@example.com']);
  assert.deepEqual(r.marked, ['A']);

  // Never emailed before (for example, no relay URL at the time): the resend
  // is the first send, so the form's recipients are told as usual.
  const fresh = relay([registration('B', { adminEmails: ['owner@example.com'] })]);
  fresh.post({ reference: 'HS-B', resend: true });
  assert.deepEqual(fresh.mail.map((m) => m.to), ['guestB@example.com', 'owner@example.com']);

  // An anonymous response that was already notified has nothing left to send.
  const anon = relay([surveyRegistration('C', { adminEmails: ['owner@example.com'] }, { email: null, email_sent_at: '2026-09-30T00:00:00Z' })]);
  assert.equal(anon.post({ reference: 'HS-C', resend: true }).skipped, 'no recipients');
  assert.equal(anon.mail.length, 0);
});

test('repeated test requests send one email per campus per minute', () => {
  const r = relay([]);
  for (let i = 0; i < 5; i++) r.post({ test: true, campus: 'hsc' });
  assert.equal(r.mail.length, 1);
  assert.equal(r.post({ test: true, campus: 'hsc' }).skipped, 'cooldown');
  // Each campus has its own allowance.
  assert.equal(r.post({ test: true, campus: 'hsn' }).ok, true);
  assert.equal(r.mail.length, 2);
});

test('date and time read as in the admin preview, whatever the script time zone', () => {
  const r = relay([]);
  // A real formatter, so the time zone the relay asks for actually matters.
  r.ctx.Utilities.formatDate = (date, zone) => new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(date);
  r.ctx.Session.getScriptTimeZone = () => 'America/New_York';
  const map = (start, end) => r.ctx.buildMergeMap(
    { name: 'Fair', event_date: '2026-10-02', start_time: start, end_time: end }, { name: 'A', reference: 'HS-A' }
  );
  assert.equal(map('09:00', '12:00').date, '2026-10-02');
  assert.equal(map('09:00', '12:00').time, '09:00 - 12:00');
  // Empty times are saved as null; the email must not show a stray dash.
  assert.equal(map('09:00', null).time, '09:00');
  assert.equal(map(null, '12:00').time, '12:00');
  assert.equal(map(null, null).time, 'To be announced');
});

test("a registrant's name goes into the email as text, never as markup", () => {
  const r = relay([]);
  const reg = { reference: 'HS-A', name: '<a href="https://evil.example">Pay your booth fee</a>' };
  const event = { name: 'Food & Fun', location: 'Main Hall' };
  const map = r.ctx.buildMergeMap(event, reg);
  const template = r.ctx.defaults({
    body: '<p>Dear Khun {{Name}}, welcome to {{Event}}.</p>',
    buttonLabel: 'Open', buttonUrl: 'https://school.example/e?n={{Name}}',
  });
  const html = r.realBuildEmailHtml(template, map, event, reg, {});
  assert.doesNotMatch(html, /href="https:\/\/evil/);
  assert.match(html, /Dear Khun &lt;a href=&quot;https:\/\/evil\.example&quot;&gt;Pay your booth fee&lt;\/a&gt;,/);
  assert.match(html, /welcome to Food &amp; Fun\./);
  // The template's own HTML is untouched, and the subject stays plain text.
  assert.match(html, /<p>Dear Khun /);
  assert.equal(r.ctx.renderMerge('Registration confirmed: {{Event}}', map), 'Registration confirmed: Food & Fun');
});

test('legacy keys go in both headers, new secret keys only in apikey', () => {
  for (const [key, bearer] of [['eyJhbGciOiJIUzI1NiJ9.legacy', true], ['sb_secret_abc123', false]]) {
    const calls = [];
    const props = { SUPABASE_URL: ' https://demo.supabase.co/ ', SERVICE_ROLE_KEY: ` ${key}\n` };
    const ctx = vm.createContext({
      PropertiesService: { getScriptProperties: () => ({ getProperty: (name) => props[name] ?? null }) },
      UrlFetchApp: {
        fetch: (url, options) => {
          calls.push({ url, options });
          return { getResponseCode: () => 200, getContentText: () => '[]' };
        },
      },
    });
    vm.runInContext(source, ctx);
    ctx.supabaseGet('/rest/v1/campuses?select=id');
    ctx.markEmailSent('r1');
    assert.equal(calls.length, 2);
    for (const { url, options } of calls) {
      // Pasted spaces, line breaks and a trailing slash are tidied away.
      assert.match(url, /^https:\/\/demo\.supabase\.co\/rest\/v1\//);
      assert.equal(options.headers.apikey, key);
      assert.equal(options.headers.Authorization, bearer ? `Bearer ${key}` : undefined);
    }
    assert.equal(calls[1].options.headers.Prefer, 'return=minimal');
  }
});

test('opening the relay URL shows the deployed version', () => {
  const r = relay([]);
  const out = r.ctx.doGet();
  assert.equal(out.ok, true);
  assert.match(out.version, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(out.version, r.ctx.RELAY_VERSION);
});

// A legacy Supabase key is a JWT whose middle part names its role.
const jwt = (role) => ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ iss: 'supabase', role })).toString('base64url'), 'sig'].join('.');

test('checkSetup reports the connection and every campus relay URL without sending email', () => {
  const r = relay([]);
  const logs = [];
  r.ctx.Logger = { log: (line) => logs.push(line) };
  r.ctx.MailApp.getRemainingDailyQuota = () => 97;
  r.ctx.Utilities.base64Decode = (text) => [...Buffer.from(text, 'base64')];
  r.ctx.Utilities.newBlob = (bytes) => ({ getDataAsString: () => Buffer.from(bytes).toString('utf8') });
  r.ctx.SUPABASE_URL = 'https://demo.supabase.co';
  r.ctx.SERVICE_KEY = jwt('service_role');
  r.ctx.fetchAppSettings = () => ({ webhook_url: 'https://script.google.com/macros/s/old/exec' });
  r.ctx.supabaseGet = () => [
    { id: 'hsc', name: 'HSC', webhook_url: 'https://script.google.com/macros/s/new/exec' },
    { id: 'hsn', name: 'HSN', webhook_url: null },
  ];
  r.ctx.checkSetup();
  assert.ok(logs.includes('Supabase connection: OK'), logs.join('\n'));
  assert.ok(logs.includes('Key type: legacy service_role key'));
  assert.ok(logs.includes('Relay URL for HSC: https://script.google.com/macros/s/new/exec'));
  assert.ok(logs.includes('Relay URL for HSN: not set, uses the global URL https://script.google.com/macros/s/old/exec'));
  assert.ok(logs.includes('Email recipients left today: 97'));
  assert.equal(r.mail.length, 0);

  // Clear messages for the usual setup mistakes. The anon key can read the
  // campus list, so only the key check catches it.
  r.ctx.SERVICE_KEY = '';
  assert.throws(() => r.ctx.checkSetup(), /SERVICE_ROLE_KEY is missing/);
  for (const [key, kind] of [[jwt('anon'), 'anon'], ['sb_publishable_abc123', 'publishable'], ['not-a-key', 'unknown']]) {
    r.ctx.SERVICE_KEY = key;
    assert.throws(() => r.ctx.checkSetup(), new RegExp(`wrong key \\(${kind}\\)`));
  }
  r.ctx.SERVICE_KEY = 'sb_secret_abc123';
  r.ctx.supabaseGet = () => { throw new Error('Supabase error: {"message":"Invalid API key"}'); };
  assert.throws(() => r.ctx.checkSetup(), /Supabase refused the connection.*Invalid API key/);
});
