import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const dir = await mkdtemp(path.join(tmpdir(), 'headstart-survey-'));
try {
  await build({
    stdin: { contents: `
      export * from './src/lib/formCopy';
      export { newEventDraft, surveyFormPreset } from './src/lib/defaults';
      export { buildResolver } from './src/components/form-renderer/fieldZod';
      export { friendlyError } from './src/lib/errors';
      export { buildEmailHtml } from './src/lib/emailHtml';
      export { buildMergeMap } from './src/lib/merge';
      import React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import { FormRenderer } from './src/components/form-renderer/FormRenderer';
      export const renderForm = (fields, submitLabel) => renderToStaticMarkup(React.createElement(FormRenderer, { fields, onSubmit: () => {}, submitLabel }));
    `, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, platform: 'node', format: 'esm',
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    alias: { '@': './src' }, define: { 'import.meta.env': '{}' }, outfile: `${dir}/m.mjs`, logLevel: 'error',
  });
  const m = await import(pathToFileURL(`${dir}/m.mjs`));

  // 1. Public survey wording never says "register".
  const survey = m.copyForType('survey');
  const publicKeys = ['skipLink', 'scrollCue', 'formHeading', 'submitLabel', 'notOpenTitle', 'closedTitle', 'closedHint', 'successTitle', 'homeBadge'];
  for (const k of publicKeys) assert.ok(!/regist/i.test(survey[k]), `survey ${k} mentions register: ${survey[k]}`);
  assert.ok(!/regist/i.test(survey.opensOn('1 Oct 2026')));
  assert.ok(!/regist/i.test(survey.shareText('Parent Feedback', 'https://x/e/pf')));
  for (const code of ['EVENT_FULL', 'REGISTRATION_CLOSED', 'REGISTRATION_NOT_OPEN', 'EVENT_NOT_FOUND', 'DUPLICATE_EMAIL']) {
    assert.ok(!/regist/i.test(m.friendlyError(new Error(code), 'survey')), code);
  }
  // Registration wording unchanged.
  assert.equal(m.copyForType('registration').submitLabel, 'Submit registration');
  assert.equal(m.friendlyError(new Error('REGISTRATION_CLOSED')), 'Registration for this event has closed.');

  // 2. A new survey draft is set up as a survey with a thank you email.
  const d = m.newEventDraft('Parent Feedback', 'parent-feedback', 'hsc', 'survey');
  assert.equal(m.formTypeOf(d), 'survey');
  assert.equal(d.settings.showQrOnSuccess, false);
  assert.equal(d.settings.requirePolicyAck, false);
  assert.equal(d.policies.length, 0);
  assert.equal(d.email_template.showQr, false);
  assert.equal(d.email_template.attachCalendar, false);
  assert.ok(!/regist|reference|booth/i.test(d.email_template.subject + d.email_template.body));
  // Registration draft unchanged.
  const r = m.newEventDraft('Fair', 'fair');
  assert.equal(m.formTypeOf(r), 'registration');
  assert.equal(r.email_template.showQr, true);

  // 3. Survey email preview has no QR or registration wording.
  const html = m.buildEmailHtml({ template: d.email_template, mergeMap: m.buildMergeMap({ ...d, name: 'Parent Feedback' }, { name: 'Somchai' }), qrUrl: 'https://qr' });
  assert.ok(html.includes('Dear Khun Somchai'));
  assert.ok(!html.includes('https://qr'));
  assert.ok(!/regist/i.test(html));

  // 4. Starter questions render and validate with name/email left empty.
  const fields = m.surveyFormPreset();
  const form = m.renderForm(fields, 'Submit');
  assert.ok(!/regist/i.test(form), 'survey form markup mentions register');
  const ids = Object.fromEntries(fields.map((f) => [f.type + ':' + f.label, f.id]));
  const values = {};
  for (const f of fields) if (f.required) values[f.id] = f.options.at(-1);
  assert.deepEqual((await m.buildResolver(fields)(values)).errors, {});
  const emailId = fields.find((f) => f.type === 'email').id;
  assert.ok((await m.buildResolver(fields)({ ...values, [emailId]: 'not-an-email' })).errors[emailId]);
  console.log('survey-forms tests passed');
} finally {
  await rm(dir, { recursive: true, force: true });
}
