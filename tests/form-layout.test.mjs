import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const dir = await mkdtemp(path.join(tmpdir(), 'headstart-layout-'));
try {
  await build({
    stdin: { contents: `
      export { themeStyle, usesQuestionCards, rgbChannels } from './src/lib/theme';
      export { defaultTheme } from './src/lib/defaults';
      export {
        buildResolver, otherError, applyOtherAnswer, otherLabelOf, canAllowOther,
        isOtherPicked, OTHER_VALUE,
      } from './src/components/form-renderer/fieldZod';
      import React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import { FormRenderer } from './src/components/form-renderer/FormRenderer';
      export const renderForm = (fields, theme) =>
        renderToStaticMarkup(React.createElement(FormRenderer, { fields, theme, onSubmit: () => {} }));
    `, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, platform: 'node', format: 'esm',
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    alias: { '@': './src' }, define: { 'import.meta.env': '{}' }, outfile: `${dir}/m.mjs`, logLevel: 'error',
  });
  const m = await import(pathToFileURL(`${dir}/m.mjs`));
  const OTHER = m.OTHER_VALUE;

  // ---- 1. "Other" is offered on checkboxes as well as multiple choice ----
  assert.equal(m.canAllowOther({ type: 'checkboxes' }), true);
  assert.equal(m.canAllowOther({ type: 'multiple_choice' }), true);
  for (const t of ['radio', 'dropdown', 'evaluation', 'rating', 'grid']) {
    assert.equal(m.canAllowOther({ type: t }), false, t);
  }

  const boxes = { id: 'cb', type: 'checkboxes', label: 'Diet', options: ['Halal', 'Vegetarian'], allowOther: true, required: true };
  const pick = { id: 'mc', type: 'multiple_choice', label: 'Session', options: ['AM', 'PM'], allowOther: true, required: true };

  assert.equal(m.isOtherPicked(boxes, ['Halal', OTHER]), true);
  assert.equal(m.isOtherPicked(boxes, ['Halal']), false);
  assert.equal(m.isOtherPicked(pick, OTHER), true);
  // A question without the option never treats the sentinel as an "Other" pick.
  assert.equal(m.isOtherPicked({ ...boxes, allowOther: false }, [OTHER]), false);

  // Ticking "Other" without typing anything is not a complete answer.
  const resolve = m.buildResolver([boxes, pick]);
  const ok = { cb: ['Halal'], mc: 'AM' };
  assert.deepEqual((await resolve(ok)).errors, {});
  assert.match((await resolve({ ...ok, cb: [OTHER] })).errors.cb.message, /Other/);
  assert.match((await resolve({ ...ok, cb: [OTHER], cb__other: '   ' })).errors.cb.message, /Other/);
  assert.equal((await resolve({ ...ok, cb: [OTHER], cb__other: 'Gluten free' })).errors.cb, undefined);
  assert.match((await resolve({ ...ok, mc: OTHER })).errors.mc.message, /Other/);
  assert.equal((await resolve({ ...ok, mc: OTHER, mc__other: 'Evening' })).errors.mc, undefined);
  // An empty required checkbox list still reports the plain required message.
  assert.match((await resolve({ ...ok, cb: [] })).errors.cb.message, /at least one/);

  // ---- 2. The typed words replace the placeholder on submit ----
  assert.deepEqual(m.applyOtherAnswer(boxes, ['Halal', OTHER], 'Gluten free'), ['Halal', 'Other: Gluten free']);
  assert.equal(m.applyOtherAnswer(pick, OTHER, ' Evening '), 'Other: Evening');
  // Untouched when "Other" was not chosen, and order is kept.
  assert.deepEqual(m.applyOtherAnswer(boxes, ['Halal', 'Vegetarian'], 'x'), ['Halal', 'Vegetarian']);
  assert.equal(m.applyOtherAnswer({ ...pick, allowOther: false }, OTHER, 'x'), OTHER);
  // Custom wording, e.g. Thai.
  assert.equal(m.otherLabelOf({}), 'Other');
  assert.equal(m.otherLabelOf({ otherLabel: 'อื่น ๆ' }), 'อื่น ๆ');
  assert.deepEqual(m.applyOtherAnswer({ ...boxes, otherLabel: 'อื่น ๆ' }, [OTHER], 'มังสวิรัติ'), ['อื่น ๆ: มังสวิรัติ']);

  // ---- 3. Layout settings become CSS variables ----
  const flat = m.themeStyle(m.defaultTheme);
  assert.equal(flat['--ev-q-gap'], '20px');
  assert.equal(flat['--ev-q-size'], '14px');
  assert.equal(flat['--ev-q-font'], 'var(--ev-font)');
  const tuned = m.themeStyle({ ...m.defaultTheme, questionGap: 40, questionSize: 20, questionWeight: 700, questionFont: 'Poppins' });
  assert.equal(tuned['--ev-q-gap'], '40px');
  assert.equal(tuned['--ev-q-size'], '20px');
  assert.equal(tuned['--ev-q-weight'], '700');
  assert.equal(tuned['--ev-q-font'], "'Poppins', var(--ev-font)");
  // An older event saved before these settings existed still gets the defaults.
  const legacy = m.themeStyle({ primary: '#1a3c5e', font: 'Inter', headingFont: 'Poppins', radius: 14 });
  assert.equal(legacy['--ev-q-gap'], '20px');
  assert.equal(legacy['--ev-q-size'], '14px');

  // Soft tints need channels, never a gradient.
  assert.equal(m.rgbChannels('#1a3c5e'), '26, 60, 94');
  assert.equal(m.rgbChannels('#fff'), '255, 255, 255');
  assert.equal(m.rgbChannels('not a colour'), '26, 60, 94');
  assert.equal(flat['--ev-primary-rgb'], '26, 60, 94');

  assert.equal(m.usesQuestionCards(undefined), false);
  assert.equal(m.usesQuestionCards({ questionLayout: 'flat' }), false);
  assert.equal(m.usesQuestionCards({ questionLayout: 'card' }), true);

  // ---- 4. Rendering ----
  const text = { id: 'nm', type: 'short_text', label: 'Name' };
  const head = { id: 'hd', type: 'heading', label: 'Section', content: 'Section' };
  const stars = { id: 'st', type: 'rating', label: 'Overall', options: ['1', '2', '3', '4', '5'], ratingIcon: 'star' };

  const cards = m.renderForm([text, head, boxes], { ...m.defaultTheme, questionLayout: 'card' });
  // Questions are boxed; a heading marks a section, so it never is.
  assert.equal((cards.match(/ev-q-card/g) || []).length, 2);
  const plain = m.renderForm([text, head, boxes], { ...m.defaultTheme, questionLayout: 'flat' });
  assert.equal(plain.includes('ev-q-card'), false);
  // Spacing is driven by the stack, and labels by their own class.
  assert.ok(plain.includes('ev-form-stack'));
  assert.ok(plain.includes('ev-q-label'));

  // The "Other" row: a text box, and never a label wrapping both controls
  // (that would tick the box whenever someone clicked into the text).
  assert.ok(cards.includes('cb__other'));
  assert.ok(cards.includes('ev-other-input'));
  assert.ok(cards.includes('for="cb__other_pick"'));
  const mcHtml = m.renderForm([pick]);
  assert.ok(mcHtml.includes('mc__other'));
  assert.ok(mcHtml.includes('for="mc__other_pick"'));

  // Choices share one styled class.
  assert.ok(mcHtml.includes('ev-choice'));
  // The gradient-unsafe tint is gone everywhere.
  assert.equal(m.renderForm([boxes, pick, stars]).includes('bg-[var(--ev-bg)]'), false);

  // Stars: one row of equal columns filling the width.
  const starHtml = m.renderForm([stars]);
  assert.ok(starHtml.includes('ev-scale'));
  assert.ok(starHtml.includes('repeat(5, minmax(0, 1fr))'), 'five equal columns');
  assert.equal((starHtml.match(/lucide-star/g) || []).length, 5);
  // Ten stars stay on one row; ten numbered boxes wrap onto two.
  const ten = { ...stars, options: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] };
  assert.ok(m.renderForm([ten]).includes('repeat(10, minmax(0, 1fr))'));
  assert.ok(m.renderForm([{ ...ten, ratingIcon: 'number' }]).includes('repeat(5, minmax(0, 1fr))'));

  // Grids size themselves from their own box, so a question card that is too
  // narrow for a table shows one card per row instead of clipping it.
  const grid5 = { id: 'g5', type: 'grid', label: 'Rate each area', rows: ['Communication', 'Facilities'], options: ['Poor', 'Fair', 'Good', 'Very good', 'Excellent'] };
  const rank8 = { id: 'r8', type: 'ranking', label: 'Rank these', options: Array.from({ length: 8 }, (_, i) => `Item ${i + 1}`) };
  const gridHtml = m.renderForm([grid5, rank8]);
  assert.ok(gridHtml.includes('ev-grid-table'));
  assert.ok(gridHtml.includes('ev-grid-cards'));
  // Five columns use the normal threshold; eight need a wider box.
  assert.equal((gridHtml.match(/ev-grid-wide/g) || []).length, 1);
  // The old viewport-based switch is gone, so the box decides, not the window.
  assert.equal(gridHtml.includes('sm:hidden'), false);
  assert.equal(gridHtml.includes('min-w-[480px]'), false);

  console.log('form layout and other-answer tests passed');
} finally {
  await rm(dir, { recursive: true, force: true });
}
