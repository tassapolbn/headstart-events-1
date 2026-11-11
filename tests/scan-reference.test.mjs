import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const dir = await mkdtemp(path.join(tmpdir(), 'headstart-scan-'));
try {
  await build({
    entryPoints: ['./src/lib/scanReference.ts'],
    bundle: true, platform: 'node', format: 'esm',
    outfile: `${dir}/m.mjs`, logLevel: 'error',
  });
  const { referenceFromScan } = await import(pathToFileURL(`${dir}/m.mjs`));

  // Confirmation email QR: the bare reference.
  assert.equal(referenceFromScan('HS-53CEAB'), 'HS-53CEAB');
  assert.equal(referenceFromScan('  hs-53ceab \n'), 'HS-53CEAB');

  // Confirmation page QR: a lookup link.
  assert.equal(referenceFromScan('https://events.example.com/lookup?ref=HS-53CEAB'), 'HS-53CEAB');

  // The bug: a site address containing "hs-" and six letters was read as the
  // reference ("HS-EVENTS"), so the page QR never found the registration.
  assert.equal(referenceFromScan('https://hs-events.netlify.app/lookup?ref=HS-53CEAB'), 'HS-53CEAB');
  assert.equal(referenceFromScan('https://hs-abc123.netlify.app/lookup?ref=HS-0A1B2C#top'), 'HS-0A1B2C');

  // A link without ref= still finds the reference after the address.
  assert.equal(referenceFromScan('https://hs-events.netlify.app/r/HS-53CEAB'), 'HS-53CEAB');

  assert.equal(referenceFromScan(''), '');
  console.log('scan reference tests passed');
} finally {
  await rm(dir, { recursive: true, force: true });
}
