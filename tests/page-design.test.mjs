import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const dir = await mkdtemp(`${tmpdir()}/page-design-`);
try {
  await build({
    stdin: { contents: `
      export { pageDesign } from './src/lib/pageDesign';
      export { filterPublicEvents, eventAvailability } from './src/lib/publicEvents';
      import React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import { EventBanner, EventIntroduction } from './src/components/event-page/EventIntroduction';
      export const render = (event) => renderToStaticMarkup(<><EventBanner event={event}/><EventIntroduction event={event} logo="/logo.svg"/></>);
    `, loader: 'tsx', resolveDir: process.cwd() },
    bundle: true, platform: 'node', format: 'esm', alias: { '@': './src' },
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    outfile: `${dir}/test.mjs`, logLevel: 'error',
  });
  const m = await import(pathToFileURL(`${dir}/test.mjs`));
  assert.equal(m.pageDesign().pageWidth, 768);
  assert.equal(m.pageDesign().bannerHeight, 0);
  assert.equal(m.pageDesign({ pageWidth: NaN }).pageWidth, 768);
  assert.equal(m.pageDesign({ pageWidth: -100, backgroundOpacity: 500 }).pageWidth, 560);
  assert.equal(m.pageDesign({ backgroundOpacity: 500 }).backgroundOpacity, 60);
  const event = { id: 'one', name: 'Big Walk', campus_id: 'hsc', location: 'School Field', status: 'open', branding: { banner_url: '/banner.png', poster_url: '/poster.png' }, theme: { primary: '#003057', accent: '#F0B323' }, settings: {}, description: '' };
  assert.equal(m.eventAvailability(event, 100), 'open');
  assert.equal(m.eventAvailability({ ...event, reg_opens_at: new Date(200).toISOString() }, 100), 'upcoming');
  assert.equal(m.eventAvailability({ ...event, reg_closes_at: new Date(50).toISOString() }, 100), 'closed');
  assert.equal(m.eventAvailability({ ...event, status: 'closed', reg_opens_at: new Date(200).toISOString() }, 100), 'closed');
  assert.equal(m.eventAvailability({ ...event, status: 'waitlist' }, 100), 'waitlist');
  const events = [event, { ...event, id: 'two', name: 'Family Feedback', campus_id: 'hsn', settings: { formType: 'survey' } }];
  assert.deepEqual(m.filterPublicEvents(events, '  WALK field ', '', '').map(e => e.id), ['one']);
  assert.deepEqual(m.filterPublicEvents(events, '', 'hsn', 'survey').map(e => e.id), ['two']);
  assert.equal(m.filterPublicEvents(events, 'Walk', 'hsn', '').length, 0);
  assert.equal(m.filterPublicEvents(events, '', '', 'registration').length, 1);
  assert.equal(m.filterPublicEvents(events, '', '', '').length, 2);
  const html = m.render({ ...event, settings: { introText: '<script>unsafe</script>' }, theme: { ...event.theme, bannerHeight: 240, bannerPosition: 80, posterWidth: 50, showEventDetails: false } });
  assert.ok(html.includes('height:240px'));
  assert.ok(html.includes('object-position:50% 80%'));
  assert.ok(html.includes('width:50%'));
  assert.ok(!html.includes('School Field'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(m.render(event).includes('School Field'));
  console.log('Page design compatibility, safe rendering, search and availability checks passed');
} finally { await rm(dir, { recursive: true, force: true }); }
