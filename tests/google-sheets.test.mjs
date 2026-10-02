import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const script = readFileSync(new URL('../apps-script/GoogleSheets.gs', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const url = id => `https://docs.google.com/spreadsheets/d/${id}/edit`;
const event = (id, dest = `sheet-${id}`) => ({ id, name: 'Same event name',
  settings: { googleSheetUrl: url(dest), formType: 'survey' },
  email_template: { enabled: false, adminNotify: false },
  form_schema: [{ id: 'q1', type: 'short_text', label: 'Question' }],
});
const registration = (eventId, id, data = {}) => ({ id, event_id: eventId,
  reference: `HS-${id}`, name: null, email: null, phone: '001234', status: 'pending',
  created_at: '2026-10-02T01:00:00Z', data,
});

class Sheet {
  values = []; notes = []; rows = 1000; columns = 26; failWrite = false;
  getLastRow() { return this.values.length; }
  getLastColumn() { return Math.max(0, ...this.values.map(row => row.length)); }
  getMaxRows() { return this.rows; }
  getMaxColumns() { return this.columns; }
  insertRowsAfter(_, count) { this.rows += count; }
  insertColumnsAfter(_, count) { this.columns += count; }
  setFrozenRows() {}
  getRange(row, col, height, width) {
    assert.ok(row + height - 1 <= this.rows && col + width - 1 <= this.columns);
    const read = source => Array.from({ length: height }, (_, r) =>
      Array.from({ length: width }, (_, c) => source[row + r - 1]?.[col + c - 1] ?? ''));
    const write = (source, data) => data.forEach((cells, r) => cells.forEach((v, c) => {
      source[row + r - 1] ??= []; source[row + r - 1][col + c - 1] = v;
    }));
    const range = {
      getValues: () => read(this.values), getNotes: () => read(this.notes),
      setNumberFormat: () => range,
      setValues: data => {
        if (this.failWrite && row > 1) throw new Error('Simulated Sheets failure');
        write(this.values, plain(data)); return range;
      },
      setNotes: data => { write(this.notes, plain(data)); return range; },
    };
    return range;
  }
}

function harness(events, registrations) {
  const books = new Map(), props = new Map(), logs = [], queries = [], triggers = [];
  let locked = false, failCheckpoint = false, failFlush = false;
  const book = id => {
    if (!books.has(id)) books.set(id, {
      metadata: [], sheet: null,
      getDeveloperMetadata() { return this.metadata.map(([key, value]) => ({ getKey: () => key, getValue: () => value })); },
      addDeveloperMetadata(key, value) { this.metadata.push([key, value]); },
      getSheetByName: function () { return this.sheet; },
      insertSheet: function () { return this.sheet = new Sheet(); },
    });
    return books.get(id);
  };
  const ctx = vm.createContext({
    SUPABASE_URL: 'https://test.supabase.co',
    PROPS: {
      getProperty: key => props.get(key), deleteProperty: key => props.delete(key),
      setProperty: (key, val) => {
        if (failCheckpoint && key.startsWith('sheets_rows_')) { failCheckpoint = false; throw new Error('Checkpoint failure'); }
        props.set(key, val);
      },
    },
    console: { error: value => logs.push(value) },
    LockService: { getScriptLock: () => ({
      tryLock: () => { if (locked) return false; locked = true; return true; }, releaseLock: () => { locked = false; },
    }) },
    SpreadsheetApp: { openById: book, DeveloperMetadataVisibility: { DOCUMENT: 'DOCUMENT' },
      flush: () => { if (failFlush) { failFlush = false; throw new Error('Flush failure'); } },
    },
    ScriptApp: {
      getProjectTriggers: () => triggers.map(name => ({ getHandlerFunction: () => name })),
      newTrigger: name => ({ timeBased: () => ({ everyMinutes: minutes => {
        assert.equal(minutes, 5); return { create: () => triggers.push(name) };
      } }) }),
    },
    supabaseGet: path => {
      queries.push(path);
      const query = new URL(`https://test.invalid${path}`).searchParams;
      const cursor = query.get('id')?.slice(3);
      const list = path.startsWith('/rest/v1/events?')
        ? events.filter(e => e.settings.googleSheetUrl != null)
        : registrations.filter(r => r.event_id === query.get('event_id')?.slice(3));
      return plain(list.filter(r => !cursor || r.id > cursor).sort((a, b) => a.id.localeCompare(b.id)).slice(0, Number(query.get('limit'))));
    },
  });
  vm.runInContext(script, ctx);
  return { ctx, book, props, queries, logs, triggers,
    checkpointFailure: () => { failCheckpoint = true; }, flushFailure: () => { failFlush = true; },
    lock: value => { locked = value; },
  };
}

test('separate spreadsheets contain only their event, including anonymous responses with emails off', () => {
  const h = harness([event('a'), event('b')], [registration('a', 'a1', { q1: 'Apple' }), registration('b', 'b1', { q1: 'Banana' })]);
  assert.equal(h.ctx.syncGoogleSheets().added, 2);
  assert.equal(h.book('sheet-a').sheet.values[1][0], 'a1');
  assert.equal(h.book('sheet-b').sheet.values[1][0], 'b1');
  assert.equal(h.book('sheet-a').sheet.values[1].at(-1), 'Apple');
  assert.equal(h.book('sheet-a').sheet.values[1][6], '001234');
  assert.equal(h.ctx.syncGoogleSheets().added, 0);
});

test('cannot reuse a spreadsheet for another event, and a failing event does not block others', () => {
  const h = harness([event('a', 'shared'), event('b', 'shared'), event('c')],
    ['a', 'b', 'c'].map(id => registration(id, `${id}1`)));
  assert.throws(() => h.ctx.syncGoogleSheets(), /failed for event\(s\): b/);
  assert.equal(h.book('shared').sheet.values.length, 2);
  assert.equal(h.book('sheet-c').sheet.values[1][0], 'c1');
});

test('a pre-existing unowned Registrations tab is never overwritten', () => {
  const h = harness([event('a')], [registration('a', 'a1')]);
  h.book('sheet-a').sheet = new Sheet();
  h.book('sheet-a').sheet.values = [['Staff records']];
  assert.throws(() => h.ctx.syncGoogleSheets(), /failed/);
  assert.deepEqual(h.book('sheet-a').sheet.values, [['Staff records']]);
});

test('write failures retry, while checkpoint or flush failure after writing cannot duplicate a row', () => {
  for (const failure of ['write', 'checkpoint', 'flush']) {
    const h = harness([event('a')], []);
    h.ctx.syncGoogleSheets();
    const sheet = h.book('sheet-a').sheet;
    // Use the public fetch seam to add a registration after initialization.
    h.ctx.supabaseGet = path => path.startsWith('/rest/v1/events?') ? [event('a')] : [registration('a', 'a1')];
    if (failure === 'write') sheet.failWrite = true;
    if (failure === 'checkpoint') h.checkpointFailure();
    if (failure === 'flush') h.flushFailure();
    assert.throws(() => h.ctx.syncGoogleSheets(), /failed/);
    sheet.failWrite = false;
    h.ctx.syncGoogleSheets();
    assert.equal(sheet.values.length, 2);
    assert.equal(sheet.values[1][0], 'a1');
  }
});

test('paged sweeps eventually recover late inserts behind the cursor and reset for a new destination', () => {
  const e = event('a');
  const regs = Array.from({ length: 205 }, (_, i) => registration('a', `r${String(i + 1).padStart(3, '0')}`));
  const h = harness([e], regs);
  assert.equal(h.ctx.syncGoogleSheets().added, 100);
  regs.push(registration('a', 'r000'));
  assert.equal(h.ctx.syncGoogleSheets().added, 100);
  assert.equal(h.ctx.syncGoogleSheets().added, 5);
  assert.equal(h.ctx.syncGoogleSheets().added, 1);
  assert.equal(h.book('sheet-a').sheet.values.length, 207);
  e.settings.googleSheetUrl = url('replacement');
  assert.equal(h.ctx.syncGoogleSheets().added, 100);
  assert.equal(h.book('replacement').sheet.values[1][0], 'r000');
});

test('more than ten events rotate across executions; disabling a link stops exports', () => {
  const events = Array.from({ length: 12 }, (_, i) => event(`e${String(i).padStart(2, '0')}`));
  const regs = events.map(e => registration(e.id, `${e.id}-r1`));
  const h = harness(events, regs);
  assert.equal(h.ctx.syncGoogleSheets().added, 10);
  assert.equal(h.ctx.syncGoogleSheets().added, 2);
  events[0].settings.googleSheetUrl = '';
  regs.push(registration(events[0].id, 'new'));
  h.ctx.syncGoogleSheets();
  assert.equal(h.book('sheet-e00').sheet.values.length, 2);
});

test('a database limit smaller than the requested page size does not strand later records', () => {
  const h = harness([event('a')], Array.from({ length: 5 }, (_, i) => registration('a', `r${i}`)));
  const read = h.ctx.supabaseGet;
  h.ctx.supabaseGet = path => read(path).slice(0, 2);
  for (let i = 0; i < 4; i++) h.ctx.syncGoogleSheets();
  assert.equal(h.book('sheet-a').sheet.values.length, 6);
});

test('overlapping runs skip and installing twice creates only one trigger', () => {
  const h = harness([], []);
  h.lock(true);
  assert.equal(h.ctx.syncGoogleSheets().skipped, 'already running');
  h.lock(false);
  h.ctx.installGoogleSheetsSync(); h.ctx.installGoogleSheetsSync();
  assert.deepEqual(h.triggers, ['syncGoogleSheets']);
});

test('reordered questions keep stable columns, new fields append, and deleted fields retain old answers', () => {
  const e = event('a');
  const regs = [registration('a', 'a1', { q1: 'First' })];
  const h = harness([e], regs); h.ctx.syncGoogleSheets();
  e.form_schema = [{ id: 'q2', label: 'Question', type: 'checkboxes' }, { id: 'q1', label: 'Renamed', type: 'short_text' }];
  regs.push(registration('a', 'a2', { q1: 'Second', q2: ['A', 'B'] }));
  h.ctx.syncGoogleSheets();
  const sheet = h.book('sheet-a').sheet;
  assert.deepEqual(sheet.values[2].slice(-2), ['Second', 'A, B']);
  e.form_schema = [];
  regs.push(registration('a', 'a3', { q1: 'Stored old answer' }));
  h.ctx.syncGoogleSheets();
  assert.equal(sheet.values[3][9], 'Stored old answer');
  sheet.notes[0][0] = '';
  assert.throws(() => h.ctx.syncGoogleSheets(), /failed/);
});

test('formula-like answers and labels are escaped, private uploads stay private, and capacity grows', () => {
  const e = event('a');
  e.form_schema = [
    { id: 'q1', label: '=IMPORTXML("bad")', type: 'short_text' },
    { id: 'file', label: 'File', type: 'file' }, { id: 'sig', label: 'Sign', type: 'signature' },
    ...Array.from({ length: 25 }, (_, i) => ({ id: `extra-${i}`, label: `Extra ${i}`, type: 'short_text' })),
  ];
  const h = harness([e], [registration('a', 'a1', { q1: '=IMPORTXML("bad")',
    file: { bucket: 'private', path: 'secret/path', name: 'menu.pdf' }, sig: 'data:image/png;base64,secret',
  })]);
  h.ctx.syncGoogleSheets();
  const sheet = h.book('sheet-a').sheet;
  assert.equal(sheet.values[0][9][0], "'");
  assert.equal(sheet.values[1][9][0], "'");
  assert.equal(sheet.values[1][10], 'menu.pdf');
  assert.equal(sheet.values[1][11], 'Signature captured (view in app)');
  assert.equal(sheet.columns, 37);
  for (const value of ['+123', '-1', '@SUM(A1)', ' \n=HYPERLINK("bad")']) assert.ok(h.ctx.sheetsText(value).startsWith("'"));
  assert.match(h.ctx.sheetsText('x'.repeat(50001)), /truncated; view full answer in app/);
});

test('frontend and worker accept only Google spreadsheet URLs; copied settings exclude the destination', () => {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/lib/googleSheets.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, mod);
  const h = harness([], []);
  for (const candidate of [url('abc'), `${url('abc')}?gid=0#gid=0`, ` ${url('abc')} `]) {
    assert.equal(mod.exports.googleSheetId(candidate), 'abc');
    assert.equal(h.ctx.sheetsDestination(candidate), 'abc');
  }
  for (const candidate of ['', undefined, 'javascript:alert(1)', 'https://docs.google.com.evil/spreadsheets/d/abc', 'https://evil@docs.google.com/spreadsheets/d/abc', 'https://docs.google.com/spreadsheets/d/e/abc/pubhtml']) {
    // Published-sheet URLs use /d/e/... and must not be mistaken for an editable file.
    assert.equal(mod.exports.googleSheetId(candidate), null);
    assert.equal(h.ctx.sheetsDestination(candidate), null);
  }
  const original = { formType: 'survey', googleSheetUrl: url('abc'), requireApproval: true };
  assert.deepEqual(plain(mod.exports.withoutGoogleSheet(original)), { formType: 'survey', requireApproval: true });
  assert.equal(original.googleSheetUrl, url('abc'));
});
