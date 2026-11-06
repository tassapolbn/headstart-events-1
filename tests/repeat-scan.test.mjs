import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const dir = await mkdtemp(path.join(tmpdir(), 'headstart-repeat-'));
try {
  await build({
    stdin: { contents: `
      import React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import { RepeatScanAlert, timeAgo } from './src/components/checkin/RepeatScanAlert';
      export { timeAgo };
      export const render = (scan) => renderToStaticMarkup(React.createElement(RepeatScanAlert, { scan, onClose: () => {} }));
    `, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, platform: 'node', format: 'esm',
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    alias: { '@': './src' }, define: { 'import.meta.env': '{}' }, outfile: `${dir}/m.mjs`, logLevel: 'error',
  });
  const m = await import(pathToFileURL(`${dir}/m.mjs`));

  // How long ago the QR was first used.
  const now = Date.parse('2026-11-08T10:00:00Z');
  assert.equal(m.timeAgo('2026-11-08T09:59:40Z', now), 'less than a minute ago');
  assert.equal(m.timeAgo('2026-11-08T09:59:00Z', now), '1 minute ago');
  assert.equal(m.timeAgo('2026-11-08T09:48:00Z', now), '12 minutes ago');
  assert.equal(m.timeAgo('2026-11-08T07:30:00Z', now), '2 hours ago');
  assert.equal(m.timeAgo('2026-11-06T09:00:00Z', now), '2 days ago');
  assert.equal(m.timeAgo(null, now), '');

  // The warning names the person and says the QR was already used.
  const html = m.render({ reference: 'HS-53CEAB', name: 'Kata Coffee', checked_in_at: '2026-11-08T09:48:00Z', booths: [{ label: 'A', number: '3' }] });
  assert.ok(html.includes('role="alertdialog"'), 'is announced as an alert');
  assert.ok(html.includes('Already checked in'));
  assert.ok(html.includes('Kata Coffee'));
  assert.ok(html.includes('HS-53CEAB'));
  assert.ok(html.includes('Booth 3'));
  assert.ok(html.includes('First scanned'));

  // Without a first scan time the line is left out rather than showing nonsense.
  const bare = m.render({ reference: 'HS-0A1B2C', name: null, checked_in_at: null });
  assert.ok(bare.includes('Unnamed'));
  assert.ok(!bare.includes('First scanned'));

  console.log('repeat scan tests passed');
} finally {
  await rm(dir, { recursive: true, force: true });
}
