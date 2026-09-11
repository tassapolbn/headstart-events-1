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
const { notificationEmailEntries, normalizeNotificationEmails, invalidNotificationEmails } = helpers.exports;
const plain = (value) => JSON.parse(JSON.stringify(value));

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
  });
  vm.runInContext(source, ctx);
  ctx.jsonOut = (value) => plain(value);
  ctx.fetchRegistration = (reference) => rows.find((r) => r.reference === reference);
  ctx.fetchCampus = () => ({ id: 'hsc', name: 'Campus', notify_emails: ['all-admins@example.com'] });
  ctx.fetchAppSettings = () => ({ admin_email: 'global@example.com' });
  ctx.buildEmailHtml = () => '<p>Confirmation</p>';
  ctx.markEmailSent = (id) => marked.push(id);
  ctx.supabaseGet = (path) => { requests.push(path); return rows; };
  const post = (payload) => ctx.doPost({ postData: { contents: JSON.stringify(payload) } });
  return { ctx, mail, marked, requests, post };
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
