import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const dir = await mkdtemp(path.join(tmpdir(), 'headstart-title-'));
try {
  await build({
    stdin: { contents: `
      export {
        contrastRatio, relativeLuminance, titleOutline, titleNeedsOutline,
        autoTitleOutlineColor, themeStyle, LARGE_TEXT_CONTRAST,
      } from './src/lib/theme';
      export { defaultTheme } from './src/lib/defaults';
    `, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, platform: 'node', format: 'esm',
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    alias: { '@': './src' }, define: { 'import.meta.env': '{}' }, outfile: `${dir}/m.mjs`, logLevel: 'error',
  });
  const m = await import(pathToFileURL(`${dir}/m.mjs`));

  // ---- The maths, against values with known answers ----
  assert.equal(Math.round(m.contrastRatio('#000000', '#ffffff')), 21);
  assert.equal(m.contrastRatio('#ffffff', '#ffffff'), 1);
  assert.equal(m.relativeLuminance('#ffffff'), 1);
  assert.equal(m.relativeLuminance('#000000'), 0);
  // Three character hex is the same colour as its six character form.
  assert.equal(m.relativeLuminance('#fff'), m.relativeLuminance('#ffffff'));
  // A gradient string is not a colour; it must not be read as one.
  assert.equal(m.relativeLuminance('linear-gradient(170deg, #fff 0%, #000 100%)'), null);
  assert.equal(m.contrastRatio('#e9b701', 'linear-gradient(170deg, #fff, #000)'), 0);

  // ---- The four themes live on the site when this was reported ----
  // Every one of them put the school's gold on a near white page. The worst
  // sat at about 1.04, which is all but invisible.
  const live = [
    ['Parent Survey', { titleColor: '#F0B323', background: '#f4f6fa' }],
    ['HeadStart Reunion', { titleColor: '#F0B323', background: '#ffffff', backgroundTo: '#9dbddd' }],
    ['Friday Market HSC', { titleColor: '#e9b701', background: '#ffffff', backgroundTo: '#e8eee2' }],
    ['Friday Market HSN', { titleColor: '#e9b701', background: '#ffffff', backgroundTo: '#fff8d6' }],
  ];
  for (const [name, theme] of live) {
    const stops = [theme.background, theme.backgroundTo].filter(Boolean);
    const worst = Math.min(...stops.map((s) => m.contrastRatio(theme.titleColor, s)));
    assert.ok(worst < m.LARGE_TEXT_CONTRAST, `${name} was expected to fail contrast, got ${worst}`);
    assert.equal(m.titleNeedsOutline(theme), true, name);
    const outline = m.titleOutline(theme);
    assert.notEqual(outline, 'none', name);
    // Four offsets make the ring, plus one soft shadow for depth.
    assert.equal((outline.match(/rgba\(/g) || []).length, 5, name);
    // Gold reads against the dark text colour, so the ring is dark, not white.
    assert.ok(outline.includes('20, 32, 46'), `${name} should ring in the dark text colour`);
  }

  // ---- A theme that already reads gets no outline ----
  const readable = { titleColor: '#1a3c5e', background: '#ffffff' };
  assert.ok(m.contrastRatio('#1a3c5e', '#ffffff') >= m.LARGE_TEXT_CONTRAST);
  assert.equal(m.titleNeedsOutline(readable), false);
  assert.equal(m.titleOutline(readable), 'none');
  // The shipped default is readable as it stands.
  assert.equal(m.titleNeedsOutline(m.defaultTheme), false);

  // ---- Light title on a dark page rings in white, not in the dark colour ----
  const onDark = { titleColor: '#F0B323', background: '#8a6a10', text: '#14202e' };
  if (m.titleNeedsOutline(onDark)) {
    const outline = m.titleOutline(onDark);
    assert.ok(outline.includes('255, 255, 255'), 'a dark page should ring the title in white');
  }

  // ---- Both stops of a gradient count, not just the first ----
  // White alone would pass for this navy, but the second stop would not.
  const mixed = { titleColor: '#4f7ba6', background: '#ffffff', backgroundTo: '#6f95ba' };
  assert.ok(m.contrastRatio('#4f7ba6', '#ffffff') >= m.LARGE_TEXT_CONTRAST);
  assert.ok(m.contrastRatio('#4f7ba6', '#6f95ba') < m.LARGE_TEXT_CONTRAST);
  assert.equal(m.titleNeedsOutline(mixed), true, 'the weaker gradient stop must decide');

  // ---- The value reaches the page as a CSS variable ----
  const styled = m.themeStyle({ ...m.defaultTheme, titleColor: '#e9b701', background: '#ffffff', backgroundTo: '#fff8d6' });
  assert.ok(styled['--ev-title-shadow'].includes('rgba('));
  assert.equal(m.themeStyle(m.defaultTheme)['--ev-title-shadow'], 'none');
  // A missing theme must not throw.
  assert.equal(typeof m.themeStyle(undefined)['--ev-title-shadow'], 'string');
  assert.equal(m.titleOutline(undefined), 'none');

  // ---- The outline can be chosen in the Theme tab ----
  const pale = { titleColor: '#e9b701', background: '#ffffff', backgroundTo: '#fff8d6', text: '#14202e' };
  const reads = { titleColor: '#1a3c5e', background: '#ffffff', text: '#14202e' };

  // Mode. 'auto' is the default and keeps the behaviour above.
  assert.equal(m.titleOutline({ ...pale, titleOutlineMode: 'auto' }), m.titleOutline(pale));
  assert.equal(m.titleOutline({ ...pale, titleOutlineMode: 'never' }), 'none');
  assert.equal(m.titleOutline({ ...reads, titleOutlineMode: 'never' }), 'none');
  // 'always' shows the ring even on a theme that reads perfectly well, which
  // is what makes picking a colour on such a theme do something visible.
  assert.equal(m.titleOutline(reads), 'none');
  assert.notEqual(m.titleOutline({ ...reads, titleOutlineMode: 'always' }), 'none');

  // Colour. A chosen one is used verbatim, in every mode that draws a ring.
  const chosen = m.titleOutline({ ...pale, titleOutlineColor: '#b3000c' });
  assert.ok(chosen.includes('179, 0, 12'), 'the chosen colour must be the ring');
  assert.equal(chosen.includes('20, 32, 46'), false, 'the automatic colour must not leak through');
  const chosenAlways = m.titleOutline({ ...reads, titleOutlineMode: 'always', titleOutlineColor: '#b3000c' });
  assert.ok(chosenAlways.includes('179, 0, 12'));
  // Choosing a colour cannot revive an outline that was switched off.
  assert.equal(m.titleOutline({ ...pale, titleOutlineMode: 'never', titleOutlineColor: '#b3000c' }), 'none');
  // Clearing the colour returns to the automatic pick.
  assert.equal(m.titleOutline({ ...pale, titleOutlineColor: undefined }), m.titleOutline(pale));

  // The swatch the editor seeds itself with is the colour actually used.
  for (const theme of [pale, reads, { titleColor: '#F0B323', background: '#8a6a10', text: '#14202e' }]) {
    const auto = m.autoTitleOutlineColor(theme);
    const rendered = m.titleOutline({ ...theme, titleOutlineMode: 'always' });
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(auto.replace('#', '').slice(i - 1, i + 1), 16));
    assert.ok(rendered.includes(`${r}, ${g}, ${b}`), `editor swatch ${auto} must match what is drawn`);
  }
  // A dark page seeds a white swatch, a pale page a dark one.
  assert.equal(m.autoTitleOutlineColor({ titleColor: '#F0B323', background: '#8a6a10', text: '#14202e' }), '#ffffff');
  assert.equal(m.autoTitleOutlineColor(pale), '#14202e');
  // With nothing to measure against it still answers with a usable colour.
  assert.equal(m.autoTitleOutlineColor(undefined), '#14202e');

  // 'always' with no readable background still draws, rather than silently
  // doing nothing after the setting was switched on.
  assert.notEqual(m.titleOutline({ titleColor: '#e9b701', background: 'linear-gradient(x)', titleOutlineMode: 'always' }), 'none');

  // And it reaches the page as a variable, same as the automatic ring.
  assert.ok(m.themeStyle({ ...reads, titleOutlineMode: 'always', titleOutlineColor: '#b3000c' })['--ev-title-shadow'].includes('179, 0, 12'));
  assert.equal(m.themeStyle({ ...pale, titleOutlineMode: 'never' })['--ev-title-shadow'], 'none');

  console.log('title contrast tests passed');
} finally {
  await rm(dir, { recursive: true, force: true });
}
