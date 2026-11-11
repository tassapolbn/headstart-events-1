import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const dir = await mkdtemp(path.join(tmpdir(), 'headstart-template-scope-'));
try {
  await build({
    entryPoints: ['src/lib/templateScope.ts'],
    bundle: true, platform: 'node', format: 'esm',
    outfile: `${dir}/m.mjs`, logLevel: 'error',
  });
  const { templateCampusFilter, isSharedTemplate } = await import(pathToFileURL(`${dir}/m.mjs`));
  for (const id of ['hsc', 'hsn', 'campus_2-west']) {
    assert.equal(templateCampusFilter(id), `campus_id.eq.${id},campus_id.is.null`);
  }
  for (const id of ['', 'hsc,campus_id.is.null', 'a)b', 'HSC', 'hsc west', 'hsc.eq', 'hsc\n']) {
    assert.throws(() => templateCampusFilter(id), /Invalid campus id/);
  }
  assert.equal(isSharedTemplate({ campus_id: null }), true);
  assert.equal(isSharedTemplate({ campus_id: 'hsc' }), false);
  assert.equal(isSharedTemplate({ campus_id: 'hsn' }), false);
  assert.equal(isSharedTemplate({ campus_id: '' }), false);
  console.log('template-scope tests passed');
} finally {
  await rm(dir, { recursive: true, force: true });
}
