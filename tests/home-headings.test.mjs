import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const dir = await mkdtemp(path.join(tmpdir(), 'headstart-home-'));
try {
  await build({
    stdin: { contents: `
      import React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import { CampusHeading } from './src/pages/public/PublicHome';
      export const render = (campus) => renderToStaticMarkup(React.createElement(CampusHeading, { campus }));
    `, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, platform: 'node', format: 'esm',
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    alias: { '@': './src' }, define: { 'import.meta.env': '{}' }, outfile: `${dir}/m.mjs`, logLevel: 'error',
  });
  const m = await import(pathToFileURL(`${dir}/m.mjs`));

  const html = m.render({ name: 'HSC', school_name: 'HeadStart International School Phuket', accent: '#1a3c5e' });
  assert.ok(html.includes('HSC'));
  assert.ok(html.includes('HeadStart International School Phuket'));

  // The bug: the event list is pulled up over the navy header, so this heading
  // sat on bg-navy-800 while its own text was text-navy-800, the exact same
  // colour, and vanished. The heading must bring its own surface rather than
  // borrow whatever is behind it.
  assert.ok(html.includes('bg-white'), 'campus heading must carry its own background');
  assert.ok(/text-navy-800/.test(html), 'heading text stays navy, now on white');

  // A campus with no school name must not render an empty line.
  const noSub = m.render({ name: 'HSC', school_name: null, accent: '#1a3c5e' });
  assert.equal(/<p[^>]*text-xs/.test(noSub), false, 'no empty subtitle line');

  // The page still pulls the list up over the header, which is what made the
  // heading land on navy in the first place. If that ever changes, this test
  // should be revisited rather than silently drifting.
  const page = await readFile(new URL('../src/pages/public/PublicHome.tsx', import.meta.url), 'utf8');
  assert.ok(/bg-navy-800/.test(page), 'header is still navy');
  assert.ok(/-mt-8/.test(page), 'list is still pulled up over the header');

  console.log('home heading tests passed');
} finally {
  await rm(dir, { recursive: true, force: true });
}
