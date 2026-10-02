import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

// New question types (Yes / No, picture choice, slider, agreement, website
// link, date and time) and the instruction box that can appear only after a
// chosen answer, for example "Not yet" showing the next steps.

const dir = await mkdtemp(path.join(tmpdir(), 'headstart-questions-'));
let m;
try {
  await build({
    stdin: { contents: `
      import React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import { FormRenderer } from './src/components/form-renderer/FormRenderer';
      export { buildResolver, isVisible, isContentField } from './src/components/form-renderer/fieldZod';
      export { changeQuestionType, answerFitsQuestion } from './src/lib/questionTypes';
      export { fieldTypeMeta } from './src/lib/defaults';
      export const render = (fields) => renderToStaticMarkup(React.createElement(FormRenderer, { fields, onSubmit: () => {} }));
    `, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, platform: 'node', format: 'esm',
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    alias: { '@': './src' }, define: { 'import.meta.env': '{}' }, outfile: `${dir}/m.mjs`, logLevel: 'error',
  });
  m = await import(pathToFileURL(`${dir}/m.mjs`));
} finally {
  await rm(dir, { recursive: true, force: true });
}

const errorsFor = async (fields, values) => Object.keys((await m.buildResolver(fields)(values)).errors);

const step = { id: 'step', type: 'yes_no', label: 'Have you paid the deposit?', options: ['Yes', 'Not yet'], required: true };
const howTo = { id: 'how', type: 'callout', label: '', tone: 'warning', content: '<p>Next step: transfer the deposit.</p>',
  image_url: 'https://example.com/qr.png', imageAlt: 'Bank QR code', condition: { fieldId: 'step', operator: 'equals', value: 'Not yet' } };
const slip = { id: 'slip', type: 'short_text', label: 'Transfer reference', required: true, condition: { fieldId: 'step', operator: 'equals', value: 'Not yet' } };
const detail = { id: 'detail', type: 'paragraph', label: 'Anything else?', required: true, condition: { fieldId: 'slip', operator: 'answered' } };

test('every new type is offered in the form builder', () => {
  for (const type of ['yes_no', 'picture_choice', 'slider', 'consent', 'url', 'datetime', 'callout']) {
    assert.ok(m.fieldTypeMeta[type], type);
  }
  assert.equal(m.isContentField({ type: 'callout' }), true);
});

test('an instruction box and follow-up question appear only for the chosen answer', async () => {
  const fields = [step, howTo, slip, detail];
  assert.equal(m.isVisible(howTo, { step: 'Yes' }, fields), false);
  assert.equal(m.isVisible(howTo, { step: 'Not yet' }, fields), true);
  // Hidden follow-ups never block sending.
  assert.deepEqual(await errorsFor(fields, { step: 'Yes' }), []);
  assert.deepEqual(await errorsFor(fields, { step: 'Not yet' }), ['slip']);

  // A question that depends on a hidden question is hidden too, even if an
  // old answer is still remembered from before the choice changed.
  assert.equal(m.isVisible(detail, { step: 'Yes', slip: 'TX-1' }, fields), false);
  assert.equal(m.isVisible(detail, { step: 'Not yet', slip: 'TX-1' }, fields), true);
  assert.deepEqual(await errorsFor(fields, { step: 'Yes', slip: 'TX-1' }), []);
});

test('the instruction box shows its text and picture when visible', () => {
  const html = m.render([{ ...howTo, condition: undefined }]);
  assert.match(html, /Next step: transfer the deposit/);
  assert.match(html, /src="https:\/\/example.com\/qr.png"/);
  assert.match(html, /alt="Bank QR code"/);
  assert.match(html, /role="note"/);
  // Hidden until the answer is chosen.
  assert.doesNotMatch(m.render([step, howTo]), /transfer the deposit/);
});

test('new question types validate their answers', async () => {
  const fields = [
    { id: 'yn', type: 'yes_no', label: 'Coming?', options: ['Yes', 'No'], required: true },
    { id: 'pic', type: 'picture_choice', label: 'Pick a stall', options: ['Food', 'Crafts'], required: true },
    { id: 'agree', type: 'consent', label: 'I agree', required: true },
    { id: 'score', type: 'slider', label: 'Score', required: true, validation: { min: 0, max: 10 } },
    { id: 'site', type: 'url', label: 'Website' },
    { id: 'when', type: 'datetime', label: 'Arrival', required: true },
  ];
  assert.deepEqual(await errorsFor(fields, {}), ['yn', 'pic', 'agree', 'score', 'when']);
  assert.deepEqual(await errorsFor(fields, { yn: 'Yes', pic: 'Food', agree: 'Agreed', score: '7', site: 'https://headstart.example', when: '2026-10-02T09:00' }), []);
  assert.deepEqual(await errorsFor(fields, { yn: 'Maybe', pic: 'Food', agree: 'Agreed', score: '7', site: 'not a link', when: '2026-10-02T09:00' }), ['yn', 'site']);
});

test('the new controls render', () => {
  const html = m.render([
    { id: 'yn', type: 'yes_no', label: 'Coming?', options: ['Yes', 'No'] },
    { id: 'pic', type: 'picture_choice', label: 'Pick', options: ['Food'], optionImages: ['https://example.com/food.jpg'] },
    { id: 'score', type: 'slider', label: 'Score', validation: { min: 0, max: 10 }, lowLabel: 'Low', highLabel: 'High' },
    { id: 'agree', type: 'consent', label: 'I accept the rules', required: true },
    { id: 'site', type: 'url', label: 'Website' },
    { id: 'when', type: 'datetime', label: 'Arrival' },
  ]);
  assert.equal((html.match(/type="radio"/g) ?? []).length, 3);
  assert.match(html, /src="https:\/\/example.com\/food.jpg"/);
  assert.match(html, /type="range"/);
  assert.match(html, /0 Low/);
  assert.match(html, /type="checkbox"/);
  assert.match(html, /I accept the rules/);
  assert.match(html, /type="url"/);
  assert.match(html, /type="datetime-local"/);
});

test('switching to the new types sets sensible defaults', () => {
  const base = { id: 'q', type: 'short_text', label: 'Question' };
  assert.deepEqual([...m.changeQuestionType(base, 'yes_no').options], ['Yes', 'No']);
  const slider = m.changeQuestionType(base, 'slider');
  assert.equal(slider.validation.max, 10);
  assert.equal(slider.step, 1);
  assert.equal(m.answerFitsQuestion(slider, '7'), true);
  assert.equal(m.answerFitsQuestion(slider, 'seven'), false);
});
