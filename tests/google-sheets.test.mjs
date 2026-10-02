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


function harness(events = [], registrations = []) {
  const books = new Map(), queries = [], triggers = ['syncGoogleSheets', 'unrelated'];
  let locked = false, failFlush = false, user = { id: 'admin', app_metadata: { role: 'staff' } }, code = 200;
  const book = id => {
    if (!books.has(id)) books.set(id, {
      metadata: [], sheet: null,
      getDeveloperMetadata() { return this.metadata.map(([key, value]) => ({ getKey: () => key, getValue: () => value })); },
      addDeveloperMetadata(key, value) { this.metadata.push([key, value]); },
      getSheetByName() { return this.sheet; }, insertSheet() { return this.sheet = new Sheet(); },
    });
    return books.get(id);
  };
  const ctx = vm.createContext({
    SUPABASE_URL: 'https://test.supabase.co', SERVICE_KEY: 'server-secret', console,
    UrlFetchApp: { fetch: (address, options) => {
      assert.equal(address, 'https://test.supabase.co/auth/v1/user');
      assert.equal(options.headers.Authorization, 'Bearer session');
      return { getResponseCode: () => code, getContentText: () => JSON.stringify(user) };
    } },
    LockService: { getScriptLock: () => ({ tryLock: () => { if (locked) return false; locked = true; return true; }, releaseLock: () => { locked = false; } }) },
    SpreadsheetApp: { openById: book, DeveloperMetadataVisibility: { DOCUMENT: 'DOCUMENT' },
      flush: () => { if (failFlush) { failFlush = false; throw new Error('Flush failure'); } } },
    ScriptApp: {
      getProjectTriggers: () => triggers.map(name => ({ getHandlerFunction: () => name })),
      deleteTrigger: trigger => triggers.splice(triggers.indexOf(trigger.getHandlerFunction()), 1),
      newTrigger: () => { throw new Error('Scheduled jobs are forbidden'); },
      getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/test/exec' }),
    },
    HtmlService: { createHtmlOutput: html => html },
    supabaseGet: path => {
      queries.push(path);
      const query = new URL('https://test.invalid' + path).searchParams;
      if (path.startsWith('/rest/v1/events?')) return plain(events.filter(e => e.id === query.get('id')?.slice(3)));
      const cursor = query.get('id')?.slice(3);
      return plain(registrations.filter(r => r.event_id === query.get('event_id')?.slice(3) && (!cursor || r.id > cursor))
        .sort((a, b) => a.id.localeCompare(b.id)).slice(0, Number(query.get('limit'))));
    },
  });
  vm.runInContext(script, ctx);
  return { ctx, book, queries, triggers, flushFailure: () => { failFlush = true; }, lock: value => { locked = value; },
    auth: (value, status = 200) => { user = value; code = status; },
    send: (e, reg) => ctx.syncRegistrationToSheet({ ...reg, events: e }),
    refresh: e => ctx.refreshEventSheet({ eventId: e.id, accessToken: 'session' }),
  };
}
const uuid = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');

test('registration export is isolated, deduplicated and makes zero extra database reads, including emails-off surveys', () => {
  const h = harness(), a = event('a'), b = event('b');
  assert.equal(h.send(a, registration('a', 'a1', { q1: 'Apple' })).added, 1);
  assert.equal(h.send(b, registration('b', 'b1', { q1: 'Banana' })).added, 1);
  assert.equal(h.send(a, registration('a', 'a1')).added, 0);
  assert.equal(h.book('sheet-a').sheet.values[1].at(-1), 'Apple');
  assert.equal(h.book('sheet-b').sheet.values[1].at(-1), 'Banana');
  assert.equal(h.book('sheet-a').sheet.values[1][6], '001234');
  assert.deepEqual(h.queries, []);
});
test('old scheduled handlers do no work and upgrading removes only the old sheet trigger', () => {
  const h = harness();
  assert.match(h.ctx.syncGoogleSheets().skipped, /disabled/);
  h.ctx.installGoogleSheetsSync(); h.ctx.installGoogleSheetsSync();
  assert.deepEqual(h.triggers, ['unrelated']); assert.deepEqual(h.queries, []);
});
test('cannot mix events, use an occupied unowned sheet, or export after disconnecting', () => {
  const h = harness(), a = event('a', 'shared'), b = event('b', 'shared');
  h.send(a, registration('a', 'a1'));
  assert.throws(() => h.send(b, registration('b', 'b1')), /another event/);
  assert.throws(() => h.send(a, registration('b', 'b1')), /mismatch/);
  const occupied = event('c'); h.book('sheet-c').sheet = new Sheet(); h.book('sheet-c').sheet.values = [['Staff records']];
  assert.throws(() => h.send(occupied, registration('c', 'c1')), /already contains/);
  assert.deepEqual(h.book('sheet-c').sheet.values, [['Staff records']]);
  a.settings.googleSheetUrl = ''; assert.equal(h.send(a, registration('a', 'a2')).added, 0);
  assert.equal(h.book('shared').sheet.values.length, 2);
});
test('write and flush failures recover on explicit retry without duplicating rows', () => {
  for (const failure of ['write', 'flush']) {
    const h = harness(), e = event('a'); h.ctx.writeEventRows(e, [], false);
    const sheet = h.book('sheet-a').sheet;
    if (failure === 'write') sheet.failWrite = true; else h.flushFailure();
    assert.throws(() => h.send(e, registration('a', 'a1')), /failure/);
    sheet.failWrite = false; h.send(e, registration('a', 'a1'));
    assert.equal(sheet.values.length, 2);
  }
});
test('manual refresh fills missed registrations and updates answers and status for only the chosen event', () => {
  const e = event(uuid(1)), other = event(uuid(2));
  const regs = [registration(e.id, uuid(3), { q1: 'Before' }), registration(other.id, uuid(4))];
  const h = harness([e, other], regs); h.send(e, regs[0]);
  regs[0].status = 'approved'; regs[0].data.q1 = 'After'; regs.push(registration(e.id, uuid(5)));
  const result = h.refresh(e);
  assert.equal(result.added, 1); assert.equal(result.updated, 1); assert.equal(result.complete, true);
  const sheet = h.book('sheet-' + e.id).sheet;
  assert.equal(sheet.values[1][8], 'approved'); assert.equal(sheet.values[1][9], 'After'); assert.equal(sheet.values.length, 3);
  assert.ok(h.queries.every(q => q.includes(e.id))); assert.equal(h.book('sheet-' + other.id).sheet, null);
  assert.equal(h.refresh(e).added, 0);
});
test('manual refresh authenticates server roles and rejects forged or anonymous roles before reading events', () => {
  for (const [user, status] of [[{}, 401], [{ id: 'x', user_metadata: { role: 'owner' } }, 200],
    [{ id: 'x', is_anonymous: true, app_metadata: { role: 'owner' } }, 200], [{ id: 'x', app_metadata: { role: 'parent' } }, 200]]) {
    const h = harness(); h.auth(user, status);
    assert.throws(() => h.refresh(event(uuid(1))), /session|owner or staff/); assert.deepEqual(h.queries, []);
  }
  const h = harness(); assert.throws(() => h.ctx.refreshEventSheet({ eventId: uuid(1) }), /Sign in/);
});
test('manual pagination handles a smaller database cap and explicitly continues bounded batches', () => {
  const e = event(uuid(1)), regs = Array.from({ length: 43 }, (_, i) => registration(e.id, uuid(i + 100)));
  const h = harness([e], regs), read = h.ctx.supabaseGet;
  h.ctx.supabaseGet = path => read(path).slice(0, 2);
  const first = h.refresh(e); assert.equal(first.added, 40); assert.equal(first.complete, false);
  const rest = h.ctx.refreshEventSheet({ eventId: e.id, accessToken: 'session', cursor: first.cursor });
  assert.equal(rest.added, 3); assert.equal(rest.complete, true);
  assert.equal(h.book('sheet-' + e.id).sheet.values.length, 44);
});
test('overlapping writes fail visibly and release the lock after a failure', () => {
  const h = harness(), e = event('a'); h.lock(true);
  assert.throws(() => h.send(e, registration('a', 'a1')), /busy/);
  h.lock(false); assert.equal(h.send(e, registration('a', 'a1')).added, 1);
});
test('question reorder, rename, type changes and removal preserve column identity and stored answers', () => {
  const h = harness(), e = event('a'); h.send(e, registration('a', 'a1', { q1: 'First' }));
  e.form_schema = [{ id: 'q2', label: 'Question', type: 'checkboxes' }, { id: 'q1', label: 'Renamed', type: 'long_text' }];
  h.send(e, registration('a', 'a2', { q1: 'Second', q2: ['A', 'B'] }));
  const sheet = h.book('sheet-a').sheet; assert.deepEqual(sheet.values[2].slice(-2), ['Second', 'A, B']);
  e.form_schema = []; h.send(e, registration('a', 'a3', { q1: 'Stored old answer' }));
  assert.equal(sheet.values[3][9], 'Stored old answer');
  sheet.notes[0][0] = ''; assert.throws(() => h.send(e, registration('a', 'a4')), /notes/);
});
test('formula-like answers are literal, private uploads stay private, and sheet capacity grows', () => {
  const e = event('a'); e.form_schema = [{ id: 'q1', label: '=IMPORTXML("bad")', type: 'short_text' },
    { id: 'file', label: 'File', type: 'file' }, { id: 'sig', label: 'Sign', type: 'signature' },
    ...Array.from({ length: 25 }, (_, i) => ({ id: 'extra-' + i, label: 'Extra ' + i, type: 'short_text' }))];
  const h = harness(); h.send(e, registration('a', 'a1', { q1: '=IMPORTXML("bad")',
    file: { bucket: 'private', path: 'secret/path', name: 'menu.pdf' }, sig: 'data:image/png;base64,secret' }));
  const sheet = h.book('sheet-a').sheet;
  assert.equal(sheet.values[0][9][0], "'"); assert.equal(sheet.values[1][9][0], "'");
  assert.equal(sheet.values[1][10], 'menu.pdf'); assert.equal(sheet.values[1][11], 'Signature captured (view in app)');
  assert.equal(sheet.columns, 37);
  for (const value of ['+123', '-1', '@SUM(A1)', ' \n=HYPERLINK("bad")']) assert.ok(h.ctx.sheetsText(value).startsWith("'"));
  assert.match(h.ctx.sheetsText('x'.repeat(50001)), /truncated; view full answer in app/);
});
test('refresh result page reports failure and escapes error content', () => {
  const h = harness(); h.ctx.refreshEventSheet = () => { throw new Error('<script>unsafe</script>'); };
  const html = h.ctx.sheetRefreshPage({}); assert.match(html, /refresh failed/); assert.ok(!html.includes('<script>'));
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
