import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const dir = await mkdtemp(path.join(tmpdir(), 'headstart-tests-'));
try {
  await build({ entryPoints: ['src/lib/assetShrink.ts'], bundle: true, platform: 'node', format: 'esm', outfile: `${dir}/assetShrink.mjs` });
  await build({ entryPoints: ['src/lib/imageShrink.ts'], bundle: true, platform: 'node', format: 'esm', outfile: `${dir}/imageShrink.mjs` });
  const { ORIGINALS, bigPictures, formatBytes, listAllFiles, shrinkStoredPictures } = await import(pathToFileURL(`${dir}/assetShrink.mjs`));
  const { MAX_SIDE, MIN_BYTES, fitWithin, hasTransparency, isShrinkable, renameForType } = await import(pathToFileURL(`${dir}/imageShrink.mjs`));

  // Only big photos, banners and posters are worth shrinking
  assert.equal(isShrinkable('image/jpeg', 1_700_000), true);
  assert.equal(isShrinkable('image/PNG', MIN_BYTES), true);
  assert.equal(isShrinkable('image/jpeg', MIN_BYTES - 1), false);
  assert.equal(isShrinkable('image/gif', 5_000_000), false);
  assert.equal(isShrinkable('image/svg+xml', 5_000_000), false);
  assert.equal(isShrinkable('application/pdf', 5_000_000), false);
  assert.equal(isShrinkable(undefined, 5_000_000), false);

  // Scaled down to fit, never up: the 6058 x 1515 banner becomes 2560 x 640
  assert.deepEqual(fitWithin(6058, 1515), { width: MAX_SIDE, height: 640 });
  assert.deepEqual(fitWithin(1080, 1920), { width: 1080, height: 1920 });
  assert.deepEqual(fitWithin(3000, 4000), { width: 1920, height: MAX_SIDE });

  // JPEG or PNG only (email programs cannot all show WebP)
  assert.equal(renameForType('Friday_Market (2).png', 'image/jpeg'), 'Friday_Market (2).jpg');
  assert.equal(renameForType('logo.webp', 'image/png'), 'logo.png');
  assert.equal(renameForType('scan', 'image/jpeg'), 'scan.jpg');

  assert.equal(hasTransparency([1, 2, 3, 255, 4, 5, 6, 255]), false);
  assert.equal(hasTransparency([1, 2, 3, 255, 4, 5, 6, 0]), true);

  assert.equal(formatBytes(5_840_000), '5.8 MB');
  assert.equal(formatBytes(820_400), '820 KB');

  // A bucket with nested folders, more files than one page, and kept originals
  const tree = {
    '': [{ name: 'app', id: null }, { name: 'event-1', id: null }, { name: ORIGINALS, id: null }, { name: 'top.png', id: 't', metadata: { size: 900_000, mimetype: 'image/png', cacheControl: 'max-age=3600' } }],
    app: [{ name: 'bg.png', id: 'a', metadata: { size: 600_000, mimetype: 'image/png', cacheControl: 'max-age=3600' } }],
    'event-1': [
      { name: 'floorplan', id: null },
      ...Array.from({ length: 1200 }, (_, i) => ({ name: `f${i}.txt`, id: `x${i}`, metadata: { size: 10, mimetype: 'text/plain' } }))
    ],
    'event-1/floorplan': [
      { name: 'plan.jpg', id: 'p', metadata: { size: 5_840_000, mimetype: 'image/jpeg', cacheControl: 'max-age=3600' } },
      { name: 'done.jpg', id: 'd', metadata: { size: 2_000_000, mimetype: 'image/jpeg', cacheControl: 'max-age=31536000' } },
      { name: 'small.jpg', id: 's', metadata: { size: 50_000, mimetype: 'image/jpeg', cacheControl: 'max-age=3600' } }
    ],
    [ORIGINALS]: [{ name: 'never-listed.jpg', id: 'o', metadata: { size: 9_000_000, mimetype: 'image/jpeg' } }]
  };
  const listed = [];
  const store = {
    calls: [],
    async list(prefix, { limit, offset }) {
      listed.push(prefix);
      return { data: (tree[prefix] ?? []).slice(offset, offset + limit), error: null };
    },
    async download(p) {
      store.calls.push(['download', p]);
      if (p === 'app/bg.png') return { data: null, error: { message: 'network down' } };
      return { data: new Blob([new Uint8Array(10)], { type: 'image/jpeg' }), error: null };
    },
    async copy(from, to) {
      store.calls.push(['copy', from, to]);
      return { error: from === 'top.png' ? { message: 'The resource already exists' } : null };
    },
    async upload(p, body, options) {
      store.calls.push(['upload', p, body.size, options.upsert, options.cacheControl]);
      return { error: null };
    }
  };

  const files = await listAllFiles(store);
  assert.equal(files.length, 1 + 1 + 1200 + 3, 'every file, across pages and folders');
  assert.ok(!listed.includes(ORIGINALS), 'the originals folder is never listed');

  const big = bigPictures(files);
  assert.deepEqual(big.map(f => f.path), ['event-1/floorplan/plan.jpg', 'top.png', 'app/bg.png'], 'biggest first; small, non-picture and already shrunk files skipped');

  const progress = [];
  const shrink = async (blob, type) => (type === 'image/png' ? { blob: new Blob([new Uint8Array(300)], { type: 'image/jpeg' }), type: 'image/jpeg' } : null);
  const outcomes = await shrinkStoredPictures(store, big, { shrink, onProgress: (done, total) => progress.push(`${done}/${total}`) });
  assert.deepEqual(outcomes, [
    { path: 'event-1/floorplan/plan.jpg', before: 5_840_000, after: null },
    { path: 'top.png', before: 900_000, after: 300 },
    { path: 'app/bg.png', before: 600_000, after: null, error: 'network down' }
  ]);
  assert.deepEqual(progress, ['1/3', '2/3', '3/3']);
  assert.deepEqual(store.calls.filter(c => c[0] !== 'download'), [
    ['copy', 'top.png', `${ORIGINALS}/top.png`],
    ['upload', 'top.png', 300, true, '31536000']
  ], 'original kept (an earlier copy is fine), then replaced under the same name with a long cache');
  console.log('image shrink tests passed');
} finally {
  await rm(dir, { recursive: true, force: true });
}
