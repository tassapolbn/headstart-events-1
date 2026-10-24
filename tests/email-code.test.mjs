import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

// "Confirm email with a 6-digit code": the form, the page wiring and the
// messages. The database side is checked in supabase/migration-008 and the
// relay side in email-notifications.test.mjs.

const dir = await mkdtemp(path.join(tmpdir(), 'headstart-email-code-'));
let m;
try {
  await build({
    stdin: { contents: `
      import React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import { FormRenderer } from './src/components/form-renderer/FormRenderer';
      import { EmailCodeBox } from './src/components/form-renderer/EmailCodeBox';
      export * from './src/components/form-renderer/emailCode';
      export { makeEmailCheck, relayCodeError } from './src/lib/emailCodes';
      export { friendlyError } from './src/lib/errors';
      export { defaultSettings } from './src/lib/defaults';
      export const renderForm = (fields, emailCheck) => renderToStaticMarkup(React.createElement(FormRenderer, { fields, onSubmit: () => {}, emailCheck }));
      export const renderBox = (props) => renderToStaticMarkup(React.createElement(EmailCodeBox, {
        id: 'em-email-code', check: {}, attention: false, confirmed: false, onConfirmed: () => {}, inputClassName: 'ev-input', ...props,
      }));
    `, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, platform: 'node', format: 'esm',
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    alias: { '@': './src' }, define: { 'import.meta.env': '{}' }, outfile: `${dir}/m.mjs`, logLevel: 'error',
  });
  m = await import(pathToFileURL(`${dir}/m.mjs`));
} finally {
  await rm(dir, { recursive: true, force: true });
}

const name = { id: 'nm', type: 'short_text', label: 'Your name', mapTo: 'name' };
const email = { id: 'em', type: 'email', label: 'Email address', mapTo: 'email', required: true };
const second = { id: 'em2', type: 'email', label: 'Second email (optional)' };
const asks = { id: 'ask', type: 'yes_no', label: 'Send a copy elsewhere?', options: ['Yes', 'No'] };
const hidden = { id: 'other', type: 'email', label: 'Other email', mapTo: 'email', condition: { fieldId: 'ask', operator: 'equals', value: 'Yes' } };

test('the switch is off for every form until staff turn it on', () => {
  assert.equal(m.defaultSettings.verifyEmail, false);
});

test('the code is checked for the same address the registration is saved with', () => {
  const fields = [name, email, second];
  // Before anything is typed, the box sits under the main email question.
  assert.equal(m.registrantEmailField(fields, {}).id, 'em');
  assert.equal(m.registrantEmail(fields, { em: '  Parent@Example.com ' }), 'Parent@Example.com');
  // A question marked as the email wins over any other email question.
  assert.equal(m.registrantEmail([second, email], { em2: 'b@x.co', em: 'a@x.co' }), 'a@x.co');
  assert.equal(m.registrantEmail([second, email], { em2: 'b@x.co' }), 'b@x.co');
  // An answer hidden by a rule is never used.
  assert.equal(m.registrantEmail([asks, hidden, email], { ask: 'No', other: 'old@x.co', em: 'a@x.co' }), 'a@x.co');
  assert.equal(m.registrantEmailField([name], {}), undefined);
  assert.equal(m.normalEmail('  A@B.Co '), 'a@b.co');
  assert.equal(m.looksLikeEmail('a@b.co'), true);
  assert.equal(m.looksLikeEmail('a@b'), false);
});

test('the form shows the code box under the email question only when the form asks for it', () => {
  const check = { send: async () => {}, confirm: async () => ({ token: 't' }) };
  const on = m.renderForm([name, email], check);
  assert.match(on, /Confirm your email address/);
  assert.match(on, /id="em-email-code"/);
  assert.ok(on.indexOf('id="em"') < on.indexOf('id="em-email-code"'), 'box follows the email question');
  // Nothing typed yet: the button waits for an address.
  assert.match(on, /<button type="button"[^>]*disabled=""[^>]*>[^<]*Send code<\/button>/);
  assert.doesNotMatch(m.renderForm([name, email]), /Confirm your email address/);
  // A form without an email question has nothing to confirm.
  assert.doesNotMatch(m.renderForm([name], check), /Confirm your email address/);
});

test('the code box tells people what happens, and shows a confirmed address plainly', () => {
  const ready = m.renderBox({ email: 'parent@example.com' });
  assert.match(ready, /We will send a 6-digit code to <strong[^>]*>parent@example.com<\/strong>/);
  assert.doesNotMatch(ready, /disabled=""[^>]*>[^<]*Send code/);
  assert.match(m.renderBox({ email: 'parent@example.com', attention: true }), /Please confirm your email address before you continue/);
  const done = m.renderBox({ email: 'parent@example.com', confirmed: true });
  assert.match(done, /Email confirmed:/);
  assert.doesNotMatch(done, /Send code/);
});

function fakeRpc(replies) {
  const calls = [];
  const rpc = async (fn, args) => { calls.push({ fn, args }); return replies[fn]; };
  return { rpc, calls };
}
function fakeFetch(reply) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (reply instanceof Error) throw reply;
    return { json: async () => reply };
  };
  return { fetchImpl, calls };
}
const RELAY = 'https://script.google.com/macros/s/abc/exec';
const REQUEST = '0f8fad5b-d9cb-469f-a165-70867728950e';

test('sending a code asks the database for it, then asks the relay to email it', async () => {
  const db = fakeRpc({ request_email_code: { data: REQUEST, error: null } });
  const relay = fakeFetch({ ok: true });
  const check = m.makeEmailCheck({ rpc: db.rpc, eventId: 'ev1', relayUrl: RELAY, kind: 'registration', fetchImpl: relay.fetchImpl, resetKey: 3 });
  assert.equal(check.resetKey, 3);
  await check.send('parent@example.com');
  assert.deepEqual(db.calls, [{ fn: 'request_email_code', args: { p_event_id: 'ev1', p_email: 'parent@example.com' } }]);
  assert.equal(relay.calls.length, 1);
  assert.equal(relay.calls[0].url, RELAY);
  assert.equal(relay.calls[0].init.method, 'POST');
  assert.equal(relay.calls[0].init.headers['Content-Type'], 'text/plain;charset=utf-8');
  assert.deepEqual(JSON.parse(relay.calls[0].init.body), { action: 'send_code', requestId: REQUEST });
});

test('a relay whose answer cannot be read still counts as sent', async () => {
  const db = fakeRpc({ request_email_code: { data: REQUEST, error: null } });
  const check = m.makeEmailCheck({ rpc: db.rpc, eventId: 'ev1', relayUrl: RELAY, kind: 'registration', fetchImpl: fakeFetch(new TypeError('Failed to fetch')).fetchImpl });
  await check.send('parent@example.com');
});

test('problems sending a code are explained to the person, or to the admin', async () => {
  const send = async (dbReply, relayReply, relayUrl = RELAY) => {
    const check = m.makeEmailCheck({
      rpc: fakeRpc({ request_email_code: dbReply }).rpc, eventId: 'ev1', relayUrl, kind: 'registration',
      fetchImpl: fakeFetch(relayReply).fetchImpl,
    });
    try { await check.send('parent@example.com'); } catch (err) { return err; }
    return null;
  };
  const ok = { data: REQUEST, error: null };

  const noRelay = await send(ok, { ok: true }, '');
  assert.match(noRelay.message, /^ADMIN: add the email relay URL/);

  const soon = await send({ data: null, error: { message: 'EMAIL_CODE_TOO_SOON' } }, { ok: true });
  assert.equal(soon.pending, true, 'a code sent moments ago can still be typed in');
  assert.match(soon.message, /less than a minute ago/);

  const many = await send({ data: null, error: { message: 'EMAIL_CODE_TOO_MANY' } }, { ok: true });
  assert.equal(many.pending, false);
  assert.match(many.message, /try again in an hour/);

  assert.match((await send({ data: null, error: { message: 'INVALID_EMAIL' } }, {})).message, /valid email address/);
  assert.match((await send({ data: null, error: { message: 'Could not find the function public.request_email_code' } }, {})).message, /^ADMIN: the website is newer than the database/);
  assert.match((await send(ok, { ok: false, error: 'missing reference' })).message, /^ADMIN: the email relay \(Apps Script\) is an older version/);
  assert.match((await send(ok, { ok: false, error: 'Exception: Service invoked too many times for one day: email.' })).message, /today’s email limit/);
  assert.match((await send(ok, { ok: false, error: 'Exception: Invalid email: parent@example' })).message, /cannot receive email/);
  assert.equal(await send(ok, { ok: true, skipped: 'already sent' }), null);
});

test('checking a code hands back the token, or the reason it was not accepted', async () => {
  const check = (reply) => m.makeEmailCheck({ rpc: fakeRpc({ check_email_code: reply }).rpc, eventId: 'ev1', relayUrl: RELAY, kind: 'survey' });
  assert.deepEqual(await check({ data: { token: 'abc' }, error: null }).confirm('a@b.co', '123456'), { token: 'abc' });
  assert.deepEqual(await check({ data: { error: 'locked' }, error: null }).confirm('a@b.co', '123456'), { error: 'locked' });
  await assert.rejects(check({ data: null, error: null }).confirm('a@b.co', '123456'), /could not be checked/);
  await assert.rejects(check({ data: null, error: { message: 'Failed to fetch' } }).confirm('a@b.co', '123456'), /check your internet connection/);
});

test('a submission without a valid confirmation gets a clear message', () => {
  assert.match(m.friendlyError({ message: 'EMAIL_NOT_VERIFIED' }), /confirm your email address again/);
  assert.match(m.friendlyError({ message: 'EMAIL_NOT_VERIFIED' }, 'survey'), /confirm your email address again/);
});
