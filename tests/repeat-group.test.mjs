import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

// Repeating details: the same questions for each child ("Add another child"),
// or "how many" first with a detail for each one (e.g. each sibling's age).

const dir = await mkdtemp(path.join(tmpdir(), 'headstart-repeat-'));
let m;
try {
  await build({
    stdin: { contents: `
      import React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import { FormRenderer } from './src/components/form-renderer/FormRenderer';
      export * from './src/lib/repeatGroup';
      export { buildResolver } from './src/components/form-renderer/fieldZod';
      export { changeQuestionType, answerFitsQuestion } from './src/lib/questionTypes';
      export { buildRows } from './src/components/registrations/exporters';
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

const plain = (value) => JSON.parse(JSON.stringify(value));
const children = {
  id: 'kids', type: 'repeat_group', label: 'Full name of your child (Children)', required: true,
  countMode: 'add', itemLabel: 'Child', minItems: 1, maxItems: 3,
  subFields: [
    { id: 'name', label: 'Full name', type: 'short_text', required: true },
    { id: 'year', label: 'Year', type: 'dropdown', required: true, options: ['Year 1', 'Year 2', 'Year 3'] },
    { id: 'class', label: 'Class', type: 'short_text' },
  ],
};
const siblings = {
  id: 'sibs', type: 'repeat_group', label: 'Number of additional siblings attending', required: true,
  countMode: 'number', itemLabel: 'Sibling', maxItems: 5,
  subFields: [{ id: 'age', label: 'Age', type: 'number', required: true }],
};
const errorFor = async (field, value) => (await m.buildResolver([field])({ [field.id]: value })).errors[field.id]?.message;

test('the new question type is offered, with sensible ready-made settings', () => {
  assert.ok(m.fieldTypeMeta.repeat_group);
  const kids = m.changeQuestionType({ id: 'q', type: 'short_text', label: 'Children' }, 'repeat_group');
  assert.equal(kids.countMode, 'add');
  assert.equal(kids.itemLabel, 'Child');
  assert.deepEqual(plain(kids.subFields.map((s) => s.label)), ['Full name', 'Year', 'Class']);
  assert.ok(kids.subFields[1].options.includes('Year 13'));
  const ages = m.defaultRepeatGroup('number');
  assert.equal(ages.countMode, 'number');
  assert.deepEqual(plain(ages.subFields.map((s) => [s.label, s.type])), [['Age', 'number']]);
  // Changing to another type clears the repeating settings.
  assert.equal(m.changeQuestionType(kids, 'short_text').subFields, undefined);
});

test('"Add another" checks each child and needs at least one when required', async () => {
  assert.equal(await errorFor(children, [{}]), 'Please fill in at least one child.');
  assert.equal(await errorFor(children, [{ name: 'Ann' }]), 'Child 1: please fill in Year.');
  assert.equal(await errorFor(children, [{ name: 'Ann', year: 'Year 2' }, { name: 'Tom' }]), 'Child 2: please fill in Year.');
  assert.equal(await errorFor(children, [{ name: 'Ann', year: 'Year 9' }]), 'Child 1: please choose Year from the list.');
  // An extra card left empty is fine, and is not saved.
  assert.equal(await errorFor(children, [{ name: 'Ann', year: 'Year 2' }, {}]), undefined);
  assert.deepEqual(plain(m.cleanRepeatValue(children, [{ name: ' Ann ', year: 'Year 2', class: '', junk: 'x' }, {}])), [{ name: 'Ann', year: 'Year 2' }]);
  assert.equal(await errorFor(children, [{}, {}, {}, {}]), 'You can add up to 3.');
  assert.equal(await errorFor({ ...children, required: false }, [{}]), undefined);
  assert.equal(m.cleanRepeatValue({ ...children, required: false }, [{}]), undefined);
});

test('"How many" asks the detail for each one, and 0 is a valid answer', async () => {
  assert.equal(await errorFor(siblings, undefined), 'Please enter how many.');
  assert.equal(await errorFor(siblings, []), undefined);
  assert.equal(await errorFor(siblings, [{ age: '7' }, {}]), 'Sibling 2: please fill in Age.');
  assert.equal(await errorFor(siblings, [{ age: 'seven' }]), 'Sibling 1: Age must be a number.');
  assert.equal(await errorFor(siblings, [{ age: '7' }, { age: '10' }]), undefined);
  assert.deepEqual(plain(m.cleanRepeatValue(siblings, [])), []);
  assert.equal(m.formatRepeatValue(siblings, []), '0');
});

test('answers read clearly in exports, one line per child', () => {
  const kids = [{ name: 'Ann Smith', year: 'Year 2', class: '2B' }, { name: 'Tom Smith', year: 'Year 3' }];
  assert.equal(m.formatRepeatValue(children, kids), 'Child 1: Full name: Ann Smith; Year: Year 2; Class: 2B\nChild 2: Full name: Tom Smith; Year: Year 3');
  assert.equal(m.formatRepeatValue(siblings, [{ age: '7' }, { age: '10' }]), '2\nSibling 1: Age: 7\nSibling 2: Age: 10');
  const rows = m.buildRows({ form_schema: [children, siblings] },
    [{ reference: 'HS-1', status: 'confirmed', created_at: '2026-10-20T00:00:00Z', data: { kids, sibs: [{ age: '7' }] } }]);
  assert.equal(rows[0].at(-2), 'Full name of your child (Children)');
  assert.match(rows[1].at(-2), /^Child 1: Full name: Ann Smith/);
  assert.equal(rows[1].at(-1), '1\nSibling 1: Age: 7');
  assert.equal(m.answerFitsQuestion(children, kids), true);
  assert.equal(m.answerFitsQuestion(children, 'Ann'), false);
});

test('the form shows one child card with an "Add another" button, or a "how many" box', () => {
  const html = m.render([children]);
  assert.match(html, /Child 1/);
  assert.match(html, /Full name/);
  assert.match(html, /<option value="Year 2">Year 2<\/option>/);
  assert.match(html, /Add another child/);
  assert.doesNotMatch(html, /Child 2/);
  const count = m.render([siblings]);
  assert.match(count, /type="number"/);
  assert.match(count, /Enter a number from 0 to 5/);
  assert.doesNotMatch(count, /Sibling 1/);
});

test('exports separate booth numbers as numbers from vendor labels', () => {
  const rows = m.buildRows({ form_schema: [] }, [{ reference: 'HS-2', status: 'confirmed',
    created_at: '2026-10-26T00:00:00Z', booths: { number: '21', label: 'Outside Provider' } }]);
  assert.equal(rows[1][rows[0].indexOf('Booth')], 21);
  assert.equal(rows[1][rows[0].indexOf('Type of vendor')], 'Outside Provider');
});
