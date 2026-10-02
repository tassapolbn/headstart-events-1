import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { build } from 'esbuild';

const dir = await mkdtemp(`${tmpdir()}/form-flexibility-`);
try {
  await build({
    stdin: { contents: `
      export { richToHtml, plainText } from './src/lib/richText';
      export { changeQuestionType, answerFitsQuestion } from './src/lib/questionTypes';
      export { themeStyle } from './src/lib/theme';
      export { buildEmailHtml } from './src/lib/emailHtml';
      export { emailDesign } from './src/lib/emailDesign';
      export { fontOptions } from './src/lib/defaults';
      export { needsConsent, consentText } from './src/components/policies/ConsentCheckbox';
      import React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import { FormRenderer } from './src/components/form-renderer/FormRenderer';
      import { ConsentCheckbox } from './src/components/policies/ConsentCheckbox';
      import { AnswerEditor } from './src/components/registrations/AnswerEditor';
      export const answer = (field, value) => renderToStaticMarkup(<AnswerEditor field={field} value={value} onChange={()=>{}}/>);
      export const form = (fields) => renderToStaticMarkup(<FormRenderer fields={fields} onSubmit={()=>{}} preview/>);
      export const consent = (event) => renderToStaticMarkup(<ConsentCheckbox event={event} checked={false} onChange={()=>{}}/>);
    `, loader: 'tsx', resolveDir: process.cwd() },
    bundle: true, platform: 'node', format: 'esm', alias: { '@': './src' }, define: { 'import.meta.env': '{}' },
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    outfile: `${dir}/test.mjs`, logLevel: 'error',
  });
  const m = await import(pathToFileURL(`${dir}/test.mjs`));
  const rich = '<span style="color:rgb(255, 0, 128);font-family:&quot;Sarabun&quot;, sans-serif">วันเปิดบ้าน</span><br/><span style="color:#123456;white-space:nowrap">Open House</span>';
  const safe = m.richToHtml(rich, true);
  assert.match(safe, /color:#ff0080/); assert.match(safe, /font-family:&quot;Sarabun&quot;/);
  assert.match(safe, /<br\/>/); assert.match(safe, /white-space:nowrap/);
  assert.equal(m.richToHtml(safe, true), safe, 'saved formatting must survive repeated editor round trips');
  const hostile = m.richToHtml('<script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">bad</a><span style="color:expression(x);background-image:url(x)" onclick="alert(1)">text</span>');
  assert.ok(!hostile.includes('<script>') && !hostile.includes('<img'));
  assert.ok(!hostile.includes('href=') && !hostile.includes('style=') && !hostile.includes('<span onclick'));
  assert.equal(m.plainText('A<br/>B &amp; C'), 'A\nB & C');

  const f = { id: 'stable', type: 'number', label: 'Old label', required: true, description: 'Instructions', image_url: '/photo.png', validation: { min: 4 }, collectNames: true, mapTo: 'name', condition: { fieldId: 'other', operator: 'answered' } };
  const dropdown = m.changeQuestionType(f, 'dropdown');
  assert.equal(dropdown.id, f.id); assert.equal(dropdown.image_url, f.image_url); assert.deepEqual(dropdown.condition, f.condition);
  assert.equal(dropdown.validation, undefined); assert.equal(dropdown.collectNames, undefined); assert.equal(dropdown.mapTo, null);
  assert.deepEqual(dropdown.options, ['Option 1', 'Option 2']); assert.deepEqual(f.validation, { min: 4 });
  assert.deepEqual(m.changeQuestionType(dropdown, 'grid').rows, ['Row 1', 'Row 2']);
  assert.equal(m.changeQuestionType(dropdown, 'rating').options.length, 5);
  assert.equal(m.changeQuestionType(dropdown, 'paragraph').options, undefined);
  assert.equal(m.answerFitsQuestion({ type: 'short_text' }, { Old: 'Yes' }), false);
  assert.equal(m.answerFitsQuestion({ type: 'number' }, 'Previously text'), false);
  assert.match(m.answer({ id: 'q', label: 'Old answer', type: 'short_text' }, { Old: 'Yes' }), /Yes/);
  assert.match(m.answer({ id: 'q', label: 'Old answer', type: 'grid', rows: ['New row'], options: ['A'] }, 'Previously text'), /Previously text/);
  assert.match(m.answer({ id: 'q', label: 'Old answer', type: 'file' }, 'Previously text'), /Replace answer using current type/);

  for (const position of ['above', 'belowLabel', 'belowAnswer']) {
    const html = m.form([{ ...f, condition: undefined, type: 'short_text', label: 'Question label', description: '<strong>Instructions</strong>', imageAlt: 'Question illustration', mediaPosition: position, labelHtml: rich }]);
    const labelAt = html.indexOf('<label'), photoAt = html.indexOf('src="/photo.png"'), inputAt = html.indexOf('<input');
    assert.ok(html.includes('<strong>Instructions</strong>') && html.includes('alt="Question illustration"'));
    if (position === 'above') assert.ok(photoAt < labelAt);
    if (position === 'belowLabel') assert.ok(labelAt < photoAt && photoAt < inputAt);
    if (position === 'belowAnswer') assert.ok(inputAt < photoAt);
    assert.match(html, /color:#ff0080/);
  }
  const checkboxEvent = { settings: { requirePolicyAck: true, policyDisplay: 'checkbox', policyAckText: '<b>I consent</b>' }, policies: [] };
  assert.equal(m.needsConsent(checkboxEvent), true); assert.match(m.consent(checkboxEvent), /type="checkbox"/); assert.match(m.consent(checkboxEvent), /<b>I consent<\/b>/);
  assert.equal(m.needsConsent({ settings: { requirePolicyAck: true }, policies: [] }), false, 'legacy forms without policies stay unchanged');
  assert.equal(m.needsConsent({ ...checkboxEvent, settings: { ...checkboxEvent.settings, requirePolicyAck: false } }), false);
  assert.equal(m.consentText({ settings: {} }), 'I agree to the terms above.');
  assert.ok(m.fontOptions.includes('Sarabun'));
  const style = m.themeStyle({ gradientPosition: 'right', gradientThickness: 7, gradientFrom: '#ff0000', gradientTo: '#0000ff', titleSize: 72, titleLineHeight: 1.5, font: 'Sarabun', inputColor: '#123456' });
  assert.equal(style['--ev-line-width'], '7px'); assert.equal(style['--ev-line-inset'], '0 0 0 auto');
  assert.equal(style['--ev-title-size'], '72px'); assert.equal(style['--ev-title-leading'], 1.5);
  assert.equal(style['--ev-input-text'], '#123456'); assert.match(style['--ev-font'], /Sarabun/);
  assert.equal(m.themeStyle({ gradientPosition: 'none' })['--ev-line-display'], 'none');

  const script = readFileSync(new URL('../apps-script/EmailRelay.gs', import.meta.url), 'utf8');
  const ctx = vm.createContext({ PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) } });
  vm.runInContext(script, ctx);
  for (const headerPosition of ['top', 'afterBanner', 'bottom', 'hidden']) {
    const opts = { template: { showLogo: true, showBanner: true, showQr: true, body: '<p>Hello {{name}}</p>', buttonLabel: 'Details', buttonUrl: 'https://example.com', design: { headerPosition, font: 'Sarabun', headerColor: '#112233', textColor: '#332211', headerAlign: 'right' } }, mergeMap: { name: 'Guest' }, logoUrl: 'https://example.com/logo.png', bannerUrl: 'https://example.com/banner.png', qrUrl: 'https://example.com/qr.png' };
    const html = m.buildEmailHtml(opts);
    assert.equal(ctx.HeadStartEmail.buildEmailHtml(opts), html, 'email preview and Google renderer must match');
    assert.match(html, /family=Sarabun/); assert.match(html, /color:#332211/);
    const header = html.indexOf('background:#112233'), banner = html.indexOf('src="https://example.com/banner.png"'), body = html.indexOf('Hello Guest');
    if (headerPosition === 'top') assert.ok(header < banner);
    if (headerPosition === 'afterBanner') assert.ok(header > banner && header < body);
    if (headerPosition === 'bottom') assert.ok(header > body);
    if (headerPosition === 'hidden') assert.equal(header, -1);
  }
  assert.equal(m.emailDesign({ headerColor: 'red;bad:thing', font: 'evil" onload="bad', logoHeight: 1000 }).headerColor, '#1a3c5e');
  assert.equal(m.emailDesign({ logoHeight: 1000 }).logoHeight, 160);
  console.log('Rich text safety and round trips, media positions, type conversion, consent, colors, Thai font and email parity passed');
} finally { await rm(dir, { recursive: true, force: true }); }
