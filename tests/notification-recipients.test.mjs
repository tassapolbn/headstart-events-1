import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { build } from 'esbuild';

// The Email tab, the event loader and the email relay must agree on who is told
// about each form. An older Email tab was once uploaded over the newer one: it
// edited a different field, promised a fallback the relay never makes, and
// staff changes made there silently did nothing.

const plain = (value) => JSON.parse(JSON.stringify(value));

const dir = await mkdtemp(path.join(tmpdir(), 'headstart-recipients-'));
let m;
try {
  await build({
    stdin: { contents: `
      import React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import { EmailTemplateEditor } from './src/components/email/EmailTemplateEditor';
      export { normalizeEvent } from './src/hooks/useEvent';
      export { newEventDraft } from './src/lib/defaults';
      export { normalizeNotificationEmails, notificationEmailEntries } from './src/lib/notificationEmails';
      export const renderEmailTab = (event) => renderToStaticMarkup(
        React.createElement(EmailTemplateEditor, { event, template: event.email_template, onChange: () => {} })
      );
    `, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, platform: 'node', format: 'esm',
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    alias: { '@': './src' }, define: { 'import.meta.env': '{}' }, outfile: `${dir}/m.mjs`, logLevel: 'error',
  });
  m = await import(pathToFileURL(`${dir}/m.mjs`));
} finally {
  await rm(dir, { recursive: true, force: true });
}

const relay = vm.createContext({ PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) } });
vm.runInContext(await readFile(new URL('../apps-script/EmailRelay.gs', import.meta.url), 'utf8'), relay);

const row = (email_template) => ({ id: 'e1', name: 'Fair', slug: 'fair', email_template });

test('what the Email tab shows and saves is exactly who the relay emails', () => {
  const stored = [
    {}, // never set
    { adminEmail: 'Legacy@School.com' }, // older single address
    { adminEmail: 'a@school.com; b@school.com' }, // older field holding several
    { adminEmails: ['list@school.com'], adminEmail: 'stale@school.com' }, // a saved list wins
    { adminEmails: [], adminEmail: 'stale@school.com' }, // an emptied list means nobody
  ];
  for (const template of stored) {
    const shown = m.normalizeEvent(row(template)).email_template.adminEmails;
    const saved = m.normalizeNotificationEmails(m.notificationEmailEntries({ adminEmails: shown }));
    assert.deepEqual(plain(saved), plain(relay.formNotifyList(template)), JSON.stringify(template));
  }
});

test('new forms start with an explicit, empty recipient list', () => {
  for (const type of ['registration', 'survey']) {
    const draft = m.newEventDraft('Fair', 'fair', 'hsc', type);
    assert.deepEqual(plain(draft.email_template.adminEmails), []);
    assert.equal(draft.email_template.adminEmail, undefined);
  }
});

test('the Email tab edits the recipient list and promises no fallback to Settings', () => {
  // The live preview falls back to this site's own logo.
  globalThis.window ??= { location: { origin: 'https://events.example' } };
  const event = m.normalizeEvent(row({ adminEmails: ['first@school.com', 'second@school.com'] }));
  const html = m.renderEmailTab(event);
  assert.match(html, /id="em-admin-emails"/);
  assert.match(html, /first@school\.com\nsecond@school\.com/);
  assert.match(html, /Leave empty to send no notifications/);
  assert.doesNotMatch(html, /address from Settings/);

  const survey = m.normalizeEvent({ ...row({}), settings: { formType: 'survey' } });
  assert.match(m.renderEmailTab(survey), /Response notifications for this form/);
});
