import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const dir = await mkdtemp(path.join(tmpdir(), 'headstart-grid-'));
try {
  await build({
    stdin: { contents: `
      export * from './src/lib/grid';
      export { buildResolver, isVisible } from './src/components/form-renderer/fieldZod';
      export { buildRows } from './src/components/registrations/exporters';
      import React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import { FormRenderer } from './src/components/form-renderer/FormRenderer';
      import { AnswerView } from './src/components/registrations/AnswerView';
      export const renderForm = (fields) => renderToStaticMarkup(React.createElement(FormRenderer, { fields, onSubmit: () => {} }));
      export const renderAnswer = (field, value) => renderToStaticMarkup(React.createElement(AnswerView, { field, value }));
    `, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, platform: 'node', format: 'esm',
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    alias: { '@': './src' }, define: { 'import.meta.env': '{}' }, outfile: `${dir}/m.mjs`, logLevel: 'error',
  });
  const m = await import(pathToFileURL(`${dir}/m.mjs`));

  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23].map(m.ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd']);

  const items = ['Academic progress', 'Social integration', 'Emotional wellbeing', 'Learning engagement', 'Teacher communication'];
  const ranking = { id: 'rk', type: 'ranking', label: 'Primary focus', options: items, required: true };
  const grid = { id: 'g', type: 'grid', label: 'Rate', rows: ['Food', 'Games'], options: ['Poor', 'Good'], required: true };
  const cgrid = { id: 'cg', type: 'checkbox_grid', label: 'Days', rows: ['Mon', 'Tue'], options: ['AM', 'PM'] };
  const stars = { id: 's', type: 'rating', label: 'Overall', options: ['1', '2', '3', '4', '5'], ratingIcon: 'star', required: true, lowLabel: 'Poor', highLabel: 'Excellent' };
  const fields = [ranking, grid, cgrid, stars];
  const resolve = m.buildResolver(fields);
  const full = { rk: Object.fromEntries(items.map((it, i) => [it, m.ordinal(i + 1)])), g: { Food: 'Good', Games: 'Poor' }, cg: { Mon: ['AM', 'PM'] }, s: '4' };

  // Valid answers pass.
  assert.deepEqual((await resolve(full)).errors, {});
  // Ranking: all items required, each rank once.
  assert.match((await resolve({ ...full, rk: { [items[0]]: '1st' } })).errors.rk.message, /every item/);
  assert.match((await resolve({ ...full, rk: { ...full.rk, [items[1]]: '1st' } })).errors.rk.message, /once/);
  // Grid required: every row.
  assert.match((await resolve({ ...full, g: { Food: 'Good' } })).errors.g.message, /every row/);
  // Unknown column rejected.
  assert.ok((await resolve({ ...full, g: { Food: 'Nope', Games: 'Poor' } })).errors.g);
  // Optional checkbox grid may be empty.
  assert.equal((await resolve({ ...full, cg: {} })).errors.cg, undefined);
  // One per column option on a normal grid.
  const r2 = m.buildResolver([{ ...grid, onePerColumn: true }]);
  assert.ok((await r2({ g: { Food: 'Good', Games: 'Good' } })).errors.g);
  // Star rating keeps the same stored values.
  assert.ok((await resolve({ ...full, s: '' })).errors.s);
  assert.ok((await resolve({ ...full, s: '9' })).errors.s);
  // Conditional logic treats an empty grid as unanswered.
  assert.equal(m.isVisible({ id: 'x', type: 'short_text', label: 'x', condition: { fieldId: 'g', operator: 'answered' } }, { g: {} }), false);

  // Rendering: ranking shows 1st to 5th, 5 rows x 5 columns (table + mobile cards), stars with labels.
  const html = m.renderForm(fields);
  for (const c of ['1st', '2nd', '3rd', '4th', '5th', 'Academic progress', 'Excellent', 'Poor']) assert.ok(html.includes(c), c);
  assert.equal((html.match(/aria-label="Academic progress: /g) || []).length, 5);
  assert.equal((html.match(/type="checkbox"/g) || []).length, 8); // 2x2 checkbox grid, table + mobile
  assert.ok(html.includes('lucide-star'));

  // Answers view and export.
  const view = m.renderAnswer(ranking, { [items[2]]: '1st', [items[0]]: '2nd' });
  assert.ok(view.indexOf('Emotional wellbeing') < view.indexOf('Academic progress'), 'ranking shown in rank order');
  const rows = m.buildRows({ form_schema: fields }, [{ reference: 'R', status: 'confirmed', data: full, created_at: '2026-09-22T00:00:00Z' }]);
  assert.ok(rows[0].includes('Primary focus [Social integration]'));
  assert.equal(rows[1][rows[0].indexOf('Primary focus [Social integration]')], '2nd');
  assert.equal(rows[1][rows[0].indexOf('Days [Mon]')], 'AM, PM');
  assert.equal(rows[1][rows[0].indexOf('Overall')], '4');
  console.log('grid and rating tests passed');
} finally {
  await rm(dir, { recursive: true, force: true });
}
