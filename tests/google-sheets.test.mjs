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
  form_schema: [{ id: 'q1', type: 'long_text', label: 'Question' }],
});
const registration = (eventId, id, data = {}) => ({ id, event_id: eventId,
  reference: `HS-${id}`, name: null, email: null, phone: '001234', status: 'pending',
  created_at: '2026-10-02T01:00:00Z', data,
});

class MetadataOwner {
  metadata = [];
  finderCalls = [];
  getDeveloperMetadata() { return this.metadata; }
  addDeveloperMetadata(key, value) {
    this.fail?.('metadata', { key, value });
    const entry = { getKey: () => key, getValue: () => value,
      setValue: v => { this.fail?.('metadata', { key, value: v }); value = v; return entry; },
      remove: () => { this.metadata.splice(this.metadata.indexOf(entry), 1); },
      getLocation: () => ({ getLocationType: () => this instanceof Sheet ? 'SHEET' : 'SPREADSHEET', getSheet: () => this instanceof Sheet ? this : null }) };
    this.metadata.push(entry); return this;
  }
  createDeveloperMetadataFinder() {
    let key, value;
    const finder = { withKey: v => (key = v, finder), withValue: v => (value = v, finder),
      find: () => { this.finderCalls.push({ key, value }); return [this, ...(this.sheets || [])].flatMap(s => s.metadata).filter(m => (key === undefined || m.getKey() === key) && (value === undefined || m.getValue() === value)); } };
    return finder;
  }
}
let sheetId = 0;
class Sheet extends MetadataOwner {
  values = []; notes = []; formats = []; formulas = []; rows = 1000; columns = 26; failWrite = false;
  calls = []; bandings = []; filter = null; rules = []; hidden = [];
  constructor(book, name = 'Sheet1') { super(); this.book = book; this.name = name; this.id = ++sheetId; }
  getName() { return this.name; } getSheetId() { return this.id; }
  setName(name) { this.fail?.('rename', { name }); this.book?.checkName(name, this); this.name = name; return this; }
  getLastRow() { return this.values.reduce((last, row, i) => row?.some(v => v !== '' && v != null) ? i + 1 : last, 0); }
  getLastColumn() { return Math.max(0, ...this.values.map(row => row?.reduce((last, v, i) => v !== '' && v != null ? i + 1 : last, 0) || 0)); }
  getMaxRows() { return this.rows; } getMaxColumns() { return this.columns; }
  insertRowsAfter(_, count) { this.rows += count; }
  insertColumnsAfter(_, count) { this.columns += count; }
  insertColumnsBefore(col, count) {
    this.fail?.('insertColumnsBefore', { col, count });
    for (const store of [this.values, this.notes, this.formats, this.formulas]) store.forEach(row => {
      while (row.length < col - 1) row.push('');
      row.splice(col - 1, 0, ...Array(count).fill(''));
    });
    this.hidden = this.hidden.map(c => c >= col ? c + count : c);
    this.columns += count;
  }
  insertRowsBefore(row, count) {
    this.fail?.('insertRowsBefore', { row, count });
    for (const store of [this.values, this.notes, this.formats, this.formulas]) {
      while (store.length < row - 1) store.push([]);
      store.splice(row - 1, 0, ...Array.from({ length: count }, () => []));
    }
    this.rows += count;
  }
  setFrozenRows(n) { this.frozen = n; }
  record(name, ...args) { this.calls.push([name, ...args]); }
  setTabColor(c) { this.fail?.('style'); this.record('tab', c); }
  setHiddenGridlines(v) { this.record('gridlines', v); }
  setRowHeight(r, h) { this.record('rowHeight', r, h); } setColumnWidth(c, w) { this.record('width', c, w); }
  hideColumns(c) { this.fail?.('hide', { col: c }); if (!this.hidden.includes(c)) this.hidden.push(c); }
  showColumns(c) { this.fail?.('show', { col: c }); this.hidden = this.hidden.filter(n => n !== c); }
  isColumnHiddenByUser(c) { this.calls.push(['isColumnHiddenByUser', c]); return this.hidden.includes(c); }
  getBandings() { return this.bandings; } getFilter() { return this.filter; }
  setConditionalFormatRules(rules) { this.rules = rules; }
  getRange(row, col, height = 1, width = 1) {
    assert.ok(row > 0 && col > 0 && height > 0 && width > 0);
    assert.ok(row + height - 1 <= this.rows && col + width - 1 <= this.columns);
    const read = source => Array.from({ length: height }, (_, r) => Array.from({ length: width }, (_, c) => source[row + r - 1]?.[col + c - 1] ?? ''));
    const write = (source, data, kind) => {
      this.calls.push([kind, row, col, height, width]);
      data.forEach((cells, r) => cells.forEach((v, c) => {
        const at = { row: row + r, col: col + c, value: v }; this.fail?.(kind, at);
        if (this.failWrite && kind === 'values' && at.row > 4) throw new Error('Simulated Sheets failure');
        source[at.row - 1] ??= [];
        // Sheets returns literal text without its input escape apostrophe.
        source[at.row - 1][at.col - 1] = kind === 'values' && typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v;
        if (kind === 'values') { this.formulas[at.row - 1] ??= []; this.formulas[at.row - 1][at.col - 1] = typeof v === 'string' && v.startsWith('=') ? v : ''; }
      }));
    };
    const fill = v => Array.from({ length: height }, () => Array(width).fill(v));
    const range = {
      getValues: () => { this.calls.push(['getValues', row, col, height, width]); return read(this.values); }, getNotes: () => read(this.notes), getNumberFormats: () => read(this.formats),
      getA1Notation: () => [row, col, height, width].join(','), getNumColumns: () => width,
      setValues: data => { write(this.values, plain(data), 'values'); return range; }, setValue: v => range.setValues([[v]]),
      setNotes: data => { write(this.notes, plain(data), 'notes'); return range; },
      setNumberFormat: v => { write(this.formats, fill(v), 'formats'); return range; },
      setNumberFormats: data => { write(this.formats, plain(data), 'formats'); return range; },
      setFormulas: data => { write(this.formulas, plain(data), 'formulas'); write(this.values, plain(data), 'formulaValues'); return range; },
      clearContent: () => { write(this.values, fill(''), 'clear'); write(this.formulas, fill(''), 'clearFormulas'); return range; },
    };
    for (const method of ['setBackground', 'setFontColor', 'setFontFamily', 'setFontSize', 'setFontWeight', 'setVerticalAlignment', 'setHorizontalAlignment', 'setWrap', 'setBorder']) {
      range[method] = (...args) => { this.record(method, range.getA1Notation(), ...args); return range; };
    }
    range.applyRowBanding = () => {
      const banding = { range: range.getA1Notation(), setRange: r => (banding.range = r.getA1Notation(), banding), setHeaderRowColor: c => (banding.header = c, banding), setFirstRowColor: c => (banding.first = c, banding), setSecondRowColor: c => (banding.second = c, banding) };
      this.bandings.push(banding); return banding;
    };
    range.createFilter = () => {
      const criteria = new Map();
      return this.filter = { range: range.getA1Notation(), getRange: () => range, remove: () => { this.filter = null; }, getColumnFilterCriteria: col => criteria.get(col) || null, setColumnFilterCriteria: (col, value) => { criteria.set(col, value); return this.filter; } };
    };
    return range;
  }
}
class Book extends MetadataOwner {
  sheets = []; failClaim = false;
  getSheets() { return this.sheets; }
  getSheetByName(name) { return this.sheets.find(s => s.name === name) || null; }
  get sheet() { return this.sheets[0] || null; }
  set sheet(tab) { tab.book = this; this.sheets = [tab]; }
  checkName(name, self) {
    if (!name || Array.from(name).length > 100 || /[\[\]*?:/\\]/.test(name) || this.sheets.some(s => s !== self && s.name.toLowerCase() === name.toLowerCase())) throw new Error('Invalid tab name');
  }
  insertSheet(name, index = this.sheets.length) {
    this.checkName(name); const tab = new Sheet(this, name); this.sheets.splice(index, 0, tab);
    if (this.failClaim) tab.fail = (op, at) => { if (op === 'metadata' && at.key === 'headstart_event') throw new Error('Claim failure'); };
    return tab;
  }
}

function harness(events = [], registrations = []) {
  const books = new Map(), queries = [], triggers = ['syncGoogleSheets', 'unrelated'];
  let locked = false, failFlush = false, user = { id: 'admin', app_metadata: { role: 'staff' } }, code = 200;
  const book = id => { if (!books.has(id)) books.set(id, new Book()); return books.get(id); };
  let tick = 0, runs = 0; const warnings = [], dateCalls = [];
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [Date.UTC(2026, 9, 24) + tick++])); }
    static now() { return Date.UTC(2026, 9, 24) + tick++; }
  }
  const ctx = vm.createContext({
    SUPABASE_URL: 'https://test.supabase.co', SERVICE_KEY: 'server-secret', Date: Clock, console: { warn: message => warnings.push(message) },
    Utilities: { getUuid: () => uuid(++runs), formatDate: (date, zone, format) => { dateCalls.push([date.toISOString(), zone, format]); return format === 'EEEE d MMMM yyyy' ? 'Friday 6 November 2026' : '24 Oct 2026, 07:00'; } },
    Session: { getScriptTimeZone: () => 'Asia/Bangkok' },
    UrlFetchApp: { fetch: (address, options) => {
      assert.equal(address, 'https://test.supabase.co/auth/v1/user');
      assert.equal(options.headers.Authorization, 'Bearer session');
      return { getResponseCode: () => code, getContentText: () => JSON.stringify(user) };
    } },
    LockService: { getScriptLock: () => ({ tryLock: () => { if (locked) return false; locked = true; return true; }, releaseLock: () => { locked = false; } }) },
    SpreadsheetApp: { openById: book, DeveloperMetadataVisibility: { DOCUMENT: 'DOCUMENT' },
      BorderStyle: { SOLID: 'SOLID', SOLID_THICK: 'SOLID_THICK' }, BandingTheme: { BLUE: 'BLUE' },
      newConditionalFormatRule: () => {
        const rule = {};
        const builder = { whenTextEqualTo: t => (rule.text = t, builder), setBackground: c => (rule.background = c, builder),
          setFontColor: c => (rule.color = c, builder), setRanges: r => (rule.ranges = r, builder), build: () => rule };
        return builder;
      },
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
  return { ctx, book, queries, triggers, warnings, dateCalls, flushFailure: () => { failFlush = true; }, lock: value => { locked = value; },
    auth: (value, status = 200) => { user = value; code = status; },
    send: (e, reg) => ctx.syncRegistrationToSheet({ ...reg, events: e }),
    refresh: (e, extra = {}) => ctx.refreshEventSheet({ eventId: e.id, accessToken: 'session', ...extra }),
  };
}
const uuid = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');

test('registration export is isolated, deduplicated and makes zero extra database reads, including emails-off surveys', () => {
  const h = harness(), a = event('a'), b = event('b');
  assert.equal(h.send(a, registration('a', 'a1', { q1: 'Apple' })).added, 1);
  assert.equal(h.send(b, registration('b', 'b1', { q1: 'Banana' })).added, 1);
  assert.equal(h.send(a, registration('a', 'a1')).added, 0);
  assert.equal(h.book('sheet-a').sheet.values[4].at(-1), 'Apple');
  assert.equal(h.book('sheet-b').sheet.values[4].at(-1), 'Banana');
  assert.equal(h.book('sheet-a').sheet.values[4][5], '001234');
  assert.deepEqual(h.queries, []);
});
test('old scheduled handlers do no work and upgrading removes only the old sheet trigger', () => {
  const h = harness();
  assert.match(h.ctx.syncGoogleSheets().skipped, /disabled/);
  h.ctx.installGoogleSheetsSync(); h.ctx.installGoogleSheetsSync();
  assert.deepEqual(h.triggers, ['unrelated']); assert.deepEqual(h.queries, []);
});
test('shared spreadsheets isolate event tabs and occupied unowned tabs are preserved', () => {
  const h = harness(), a = event('a', 'shared'), b = event('b', 'shared');
  h.send(a, registration('a', 'a1')); h.send(b, registration('b', 'b1'));
  assert.equal(h.book('shared').sheets.length, 2);
  assert.equal(h.book('shared').sheets[1].name, 'Same event name (2)');
  assert.throws(() => h.send(a, registration('b', 'b1')), /mismatch/);
  const occupied = event('c'), tab = h.book('sheet-c').insertSheet('Registrations'); tab.values = [['Staff records']];
  h.send(occupied, registration('c', 'c1'));
  assert.deepEqual(tab.values, [['Staff records']]); assert.equal(h.book('sheet-c').sheets.length, 2);
  a.settings.googleSheetUrl = ''; assert.equal(h.send(a, registration('a', 'a2')).added, 0);
  assert.equal(h.book('shared').sheet.values.length, 5);
});

test('write and flush failures recover on explicit retry without duplicating rows', () => {
  for (const failure of ['write', 'flush']) {
    const h = harness(), e = event('a'); h.ctx.writeEventRows(e, [], false);
    const sheet = h.book('sheet-a').sheet;
    if (failure === 'write') sheet.failWrite = true; else h.flushFailure();
    assert.throws(() => h.send(e, registration('a', 'a1')), /failure/);
    sheet.failWrite = false; h.send(e, registration('a', 'a1'));
    assert.equal(sheet.values.length, 5);
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
  assert.equal(cell(sheet, regs[0].id, 'status'), 'approved'); assert.equal(cell(sheet, regs[0].id, 'answer:q1'), 'After'); assert.equal(sheet.values.length, 6);
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
  const rest = h.ctx.refreshEventSheet({ eventId: e.id, accessToken: 'session', runId: first.runId });
  assert.equal(rest.added, 3); assert.equal(rest.complete, true);
  assert.equal(h.book('sheet-' + e.id).sheet.values.length, 47);
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
  const sheet = h.book('sheet-a').sheet; assert.deepEqual(sheet.values[5].slice(-2), ['Second', 'A, B']);
  e.form_schema = []; h.send(e, registration('a', 'a3', { q1: 'Stored old answer' }));
  assert.equal(cell(sheet, 'a3', 'answer:q1'), 'Stored old answer');
  sheet.notes[3][0] = ''; assert.throws(() => h.send(e, registration('a', 'a4')), /notes/);
});
test('formula-like answers are literal, private uploads stay private, and sheet capacity grows', () => {
  const e = event('a'); e.form_schema = [{ id: 'q1', label: '=IMPORTXML("bad")', type: 'long_text' },
    { id: 'file', label: 'File', type: 'file' }, { id: 'sig', label: 'Sign', type: 'signature' },
    ...Array.from({ length: 25 }, (_, i) => ({ id: 'extra-' + i, label: 'Extra ' + i, type: 'long_text' }))];
  const h = harness(); h.send(e, registration('a', 'a1', { q1: '=IMPORTXML("bad")',
    file: { bucket: 'private', path: 'secret/path', name: 'menu.pdf' }, sig: 'data:image/png;base64,secret' }));
  const sheet = h.book('sheet-a').sheet;
  assert.equal(sheet.formulas[3][column(sheet, 'answer:q1')], ''); assert.equal(sheet.formulas[4][column(sheet, 'answer:q1')], ''); assert.equal(cell(sheet, 'a1', 'answer:q1'), '=IMPORTXML("bad")');
  assert.equal(cell(sheet, 'a1', 'answer:file'), 'menu.pdf'); assert.equal(cell(sheet, 'a1', 'answer:sig'), 'Signature captured (view in app)');
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

class StyledSheet extends Sheet {}

test('the export sheet carries HeadStart branding and grows its formatting with new rows', () => {
  const h = harness(), e = event('a'); const sheet = h.book('sheet-a').sheet = new StyledSheet();
  h.send(e, registration('a', 'a1', { q1: 'Apple' }));
  const header = '4,1,1,10';
  assert.ok(sheet.calls.some(c => c[0] === 'setBackground' && c[1] === header && c[2] === '#1a3c5e'));
  assert.ok(sheet.calls.some(c => c[0] === 'setFontColor' && c[1] === header && c[2] === '#ffffff'));
  assert.ok(sheet.calls.some(c => c[0] === 'setBorder' && c[1] === header && c.includes('#f0b323')));
  assert.ok(sheet.calls.some(c => c[0] === 'tab' && c[1] === '#1a3c5e'));
  assert.deepEqual(sheet.hidden.slice(0, 1), [1]);
  assert.equal(sheet.bandings.length, 1);
  assert.equal(sheet.bandings[0].second, '#eef3f8');
  assert.equal(sheet.filter.range, '4,1,997,10');
  assert.deepEqual(plain(sheet.rules.map(r => r.text)), ['confirmed', 'pending', 'waitlist', 'rejected', 'cancelled']);
  // Status formatting covers every available data row.
  assert.equal(sheet.rules[0].ranges[0].getA1Notation(), '5,9,996,1');

  h.send(e, registration('a', 'a2'));
  assert.equal(sheet.bandings.length, 1, 'the banding is extended, not stacked');
  assert.equal(sheet.bandings[0].range, '4,1,3,10');
  assert.equal(sheet.filter.range, '4,1,997,10');
  assert.equal(sheet.values.length, 6);
});

test('a styling failure never stops a registration reaching the sheet', () => {
  const h = harness(), e = event('a'); const sheet = h.book('sheet-a').sheet = new StyledSheet();
  sheet.setTabColor = () => { throw new Error('Formatting service unavailable'); };
  assert.equal(h.send(e, registration('a', 'a1', { q1: 'Apple' })).added, 1);
  assert.equal(sheet.values[4].at(-1), 'Apple');
});

test('repeating details export as one readable line per child', () => {
  const h = harness();
  const e = { ...event('kids'), form_schema: [
    { id: 'kids', type: 'repeat_group', label: 'Children', itemLabel: 'Child', countMode: 'add',
      subFields: [{ id: 'n', label: 'Full name' }, { id: 'y', label: 'Year' }] },
    { id: 'sibs', type: 'repeat_group', label: 'Siblings', itemLabel: 'Sibling', countMode: 'number',
      subFields: [{ id: 'a', label: 'Age' }] },
  ] };
  h.send(e, registration('kids', 'k1', { kids: [{ n: 'Ann', y: 'Year 2' }, { n: 'Tom' }], sibs: [] }));
  const tab = h.book('sheet-kids').sheet;
  const key = (...parts) => 'detail:' + JSON.stringify(parts);
  assert.equal(cell(tab, 'k1', key('kids', 'entry', 0, 'n')), 'Ann');
  assert.equal(cell(tab, 'k1', key('kids', 'entry', 1, 'n')), 'Tom');
  assert.equal(cell(tab, 'k1', key('kids', 'entry', 1, 'y')), '');
  assert.equal(cell(tab, 'k1', key('sibs', 'count')), 0);
  assert.ok(tab.hidden.includes(column(tab, 'answer:kids') + 1));
  const oldIndex = column(tab, key('kids', 'entry', 0, 'n'));
  e.form_schema[0].subFields.reverse(); e.form_schema[0].label = 'Renamed';
  h.ctx.writeEventRows(e, [registration('kids', 'k1', { kids: [{ n: 'Updated' }] })], true);
  assert.equal(column(tab, key('kids', 'entry', 0, 'n')), oldIndex);
  assert.equal(cell(tab, 'k1', key('kids', 'entry', 0, 'n')), 'Updated');
  e.settings.googleSheetExclude = ['answer:kids']; h.ctx.writeEventRows(e, [], false);
  assert.equal(cell(tab, 'k1', key('kids', 'entry', 0, 'n')), '');
  assert.ok(tab.hidden.includes(oldIndex + 1));
});

const metadata = (s, key) => s.metadata.find(m => m.getKey() === key)?.getValue();

test('TS and Apps Script helpers agree on conservative contact, label, total and tab-name fixtures', () => {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/lib/googleSheets.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, mod);
  const front = mod.exports, back = harness().ctx;
  const f = (id, type, label, mapTo) => ({ id, type, label, ...(mapTo ? { mapTo } : {}) });
  const fixtures = [
    [[], [null, null, null]],
    [[f('n', 'short_text', 'ชื่อ'), f('e', 'email', 'อีเมล'), f('p', 'phone', 'มือถือ')], ['n', 'e', 'p']],
    [[f('n1', 'short_text', 'Name', 'name'), f('n2', 'short_text', 'Name 2', 'name')], [null, null, null]],
    [[f('e1', 'email', 'Email', 'email'), f('e2', 'email', 'Email 2', 'email')], [null, null, null]],
    [[f('p1', 'phone', 'Phone', 'phone'), f('p2', 'phone', 'Phone 2', 'phone')], [null, null, null]],
    [[f('other', 'short_text', 'Email', 'phone'), f('next', 'short_text', 'Name')], [null, null, 'other']],
    [[f('n', 'short_text', 'Name'), f('email', 'email', 'Contact', 'phone'), f('other', 'email', 'Email')], ['n', null, 'email']],
    [[f('n', 'short_text', 'Name'), f('email', 'short_text', 'E-mail')], ['n', 'email', null]],
    [[f('n', 'short_text', 'Name'), f('e1', 'short_text', 'Email'), f('e2', 'short_text', 'อีเมล')], ['n', null, null]],
    [[f('n', 'short_text', 'Name'), f('p1', 'phone', 'Phone'), f('p2', 'short_text', 'Mobile')], ['n', null, null]],
    [[f('overlap', 'short_text', 'Email phone')], ['overlap', null, null]],
    [[f('n', 'short_text', 'Name'), f('overlap', 'short_text', 'Email phone')], ['n', 'overlap', null]],
    [[f('heading', 'heading', 'Name', 'name'), f('n', 'short_text', 'Name')], ['n', null, null]],
  ];
  for (const [fields, expected] of fixtures) {
    const ui = front.sheetContactSources(fields), worker = back.sheetsContactSources(fields);
    assert.deepEqual(plain(ui), plain(worker));
    assert.deepEqual(['name', 'email', 'phone'].map(k => ui[k]?.id ?? null), expected);
    assert.deepEqual(plain(front.sheetQuestions(fields)), plain(back.sheetsQuestions(fields)));
    for (const key of ['name', 'email', 'phone']) for (const source of [null, ...fields, { label: '  Contact\n detail  ' }, { label: '=SUM(A1)' }]) {
      assert.equal(front.sheetContactLabel(key, source), back.sheetsContactLabel(key, source));
    }
  }
  assert.equal(front.sheetContactLabel('email', { label: 'Contact' }), 'Email — Contact');
  for (const [field, expected] of [[{ type: 'number' }, true], [{ type: 'number', collectNames: true }, false], [{ type: 'slider' }, true], [{ type: 'repeat_group' }, false], [{ type: 'short_text' }, false]]) {
    assert.equal(front.canTotal(field), expected); assert.equal(back.sheetsCanTotal(field), expected);
  }
  for (const [settings, name, expected] of [[{}, '', 'Event'], [{ googleSheetTab: '  Friday\n Market  ' }, 'Other', 'Friday Market'], [{ googleSheetTab: '\u0000' }, 'Event name', 'Event name'], [{}, '😀'.repeat(101), '😀'.repeat(100)]]) {
    assert.equal(front.sheetTabName(settings, name), expected); assert.equal(back.sheetsTabName(settings, name), expected);
  }
  assert.deepEqual(plain(front.withoutGoogleSheet({ googleSheetUrl: url('a'), googleSheetTab: 'Tab', googleSheetTotals: ['n'], googleSheetExclude: ['phone'] })), { googleSheetTotals: ['n'], googleSheetExclude: ['phone'] });
});

test('contact row writes merge conditional and divergent answers without losing base values', () => {
  const h = harness(), e = event('a'); e.form_schema = [
    { id: 'n', type: 'short_text', label: 'Your name', mapTo: 'name' },
    { id: 'e', type: 'email', label: 'Contact', mapTo: 'email' },
    { id: 'p', type: 'phone', label: 'Mobile', mapTo: 'phone' },
  ];
  h.send(e, { ...registration('a', 'equal', { n: ' ann   SMITH ', e: ' ANN@EXAMPLE.COM ', p: '+66 123' }), name: 'Ann Smith', email: 'ann@example.com', phone: '66123' });
  h.send(e, { ...registration('a', 'absent'), name: 'Keep name', email: 'keep@example.com', phone: '00123' });
  h.send(e, { ...registration('a', 'different', { n: 'New name', e: 'new@example.com', p: '999' }), name: 'Old name', email: 'old@example.com', phone: '00123' });
  const tab = tabFor(h, e);
  assert.equal(column(tab, 'answer:e'), -1); assert.equal(tab.values[3][column(tab, 'email')], 'Email — Contact');
  for (const [key, equal, absent, divergent] of [['name', 'Ann Smith', 'Keep name', 'Old name\nForm answer: New name'], ['email', 'ann@example.com', 'keep@example.com', 'old@example.com\nForm answer: new@example.com'], ['phone', '66123', '00123', '00123\nForm answer: 999']]) {
    assert.equal(cell(tab, 'equal', key), equal); assert.equal(cell(tab, 'absent', key), absent); assert.equal(cell(tab, 'different', key), divergent);
  }
  assert.equal(h.ctx.sheetsMerge('email', '', 'only@example.com'), 'only@example.com');
});

test('fold idempotency recognises only complete generated segments, including multi-line answers', () => {
  const merge = harness().ctx.sheetsMerge;
  for (const answer of ['One', 'One\nTwo', 'One\nForm answer: Two']) {
    const once = merge('name', 'Base', answer);
    assert.equal(merge('name', once, answer), once);
    assert.equal(merge('name', once + '\nOther line', answer), once + '\nOther line');
    assert.equal(merge('name', once + ' suffix', answer), once + ' suffix\nForm answer: ' + answer);
    assert.equal(merge('name', 'Contains ' + answer, answer), 'Contains ' + answer + '\nForm answer: ' + answer);
  }
});

test('totals use strict finite numbers, explicit data and total formats, and ignore detailed number/repeat settings', () => {
  const h = harness(), e = event('a'); e.form_schema = [
    { id: 'n', label: 'Number', type: 'number' }, { id: 's', label: 'Slider', type: 'slider' },
    { id: 'names', label: 'Number with names', type: 'number', collectNames: true },
    { id: 'repeat', label: 'Repeating', type: 'repeat_group', countMode: 'number', subFields: [] },
  ]; e.settings.googleSheetTotals = ['n', 's', 'names', 'repeat'];
  const values = [' 12 ', '-2', '3.125', '1e3', '+2', '1,000', '3 tickets', '', '=SUM(A1)', '9'.repeat(400), 4];
  values.forEach((n, i) => h.send(e, registration('a', `r${i}`, { n, s: 2, names: '3\nAnn', repeat: [{}] })));
  const tab = tabFor(h, e), n = column(tab, 'answer:n'), slider = column(tab, 'answer:s');
  assert.deepEqual(dataRows(tab).map(r => r[n]), [12, -2, 3.125, ...values.slice(3)]);
  assert.deepEqual(tab.formats.slice(4).map(r => r[n]), ['#,##0', '#,##0', '#,##0.0#########', '@', '@', '@', '@', '@', '@', '@', '#,##0']);
  assert.equal(tab.formats[2][n], '#,##0.0#'); assert.equal(tab.formats[2][slider], '#,##0');
  for (const key of ['answer:names', 'answer:repeat']) assert.equal(tab.formulas[2][column(tab, key)], '');
  assert.match(tab.formulas[2][1], /^="Total for "&IF\(SUBTOTAL\(103,A5:A\)/);
  e.settings.googleSheetTotals = []; h.ctx.writeEventRows(e, [], false); assert.equal(tab.formulas[2][n], ''); assert.equal(tab.formats[2][n], '@');
  assert.equal(flags(tab, 'answer:n').num, undefined);
  e.form_schema[0].type = 'long_text'; h.ctx.writeEventRows(e, [], false); assert.equal(flags(tab, 'answer:n').num, undefined); assert.equal(cell(tab, 'r0', 'answer:n'), 12);
});

test('numeric transition and exclusion operate on every archived row and never repeat in steady state', () => {
  const h = harness(), e = event('a'); e.form_schema = [{ id: 'q1', label: 'Count', type: 'long_text' }];
  const tab = legacy(h, e, [registration('a', 'deleted', { q1: '7' })]); h.ctx.writeEventRows(e, [], false);
  e.form_schema[0].type = 'number'; e.settings.googleSheetTotals = ['q1']; h.ctx.writeEventRows(e, [], false);
  assert.equal(cell(tab, 'deleted', 'answer:q1'), 7); const before = tab.calls.filter(c => c[0] === 'values' && c[1] > 4).length;
  h.ctx.writeEventRows(e, [], false); assert.equal(tab.calls.filter(c => c[0] === 'values' && c[1] > 4).length, before);
  e.settings.googleSheetExclude = ['answer:q1']; h.ctx.writeEventRows(e, [], false); assert.equal(cell(tab, 'deleted', 'answer:q1'), ''); assert.equal(tab.formulas[2][column(tab, 'answer:q1')], '');
});

test('last-column fallback preserves Reference, summary avoids totals and respects staff-hidden columns', () => {
  const h = harness(), e = event('a'); e.form_schema = [{ id: 'n', type: 'number', label: 'Count' }]; e.settings.googleSheetTotals = ['n'];
  e.settings.googleSheetExclude = ['reference', 'created_at', 'name', 'email', 'phone', 'booth', 'vendor_type', 'status'];
  h.send(e, registration('a', 'a1', { n: '3' })); const tab = tabFor(h, e), n = column(tab, 'answer:n');
  assert.equal(tab.values[0][n], e.name); assert.equal(tab.formulas[2].filter(Boolean).length, 1); assert.match(tab.formulas[2][n], /^=SUBTOTAL/);
  e.settings.googleSheetExclude.push('id', 'answer:n'); h.ctx.writeEventRows(e, [], false);
  assert.equal(flags(tab, 'id').excluded, undefined); assert.equal(flags(tab, 'reference').excluded, undefined);
  assert.match(tab.formulas[2][1], /responses/); assert.equal(tab.values[0][1], e.name);
  e.settings.googleSheetExclude = []; h.ctx.writeEventRows(e, [], false);
  tab.hideColumns(2); h.ctx.writeEventRows(e, [], false); assert.ok(tab.hidden.includes(2)); assert.match(tab.formulas[2][2], /responses/);
});

test('title/details use literal text and date zones; title or styling failure never blocks rows', () => {
  const h = harness(), e = event('a'); e.name = '=Untrusted'; e.location = '=Untrusted location';
  h.send(e, registration('a', 'a1')); const tab = tabFor(h, e);
  assert.equal(tab.values[0][1], e.name); assert.equal(tab.formulas[0][1], ''); assert.equal(tab.formulas[1][1], '');
  assert.equal(tab.formats[0][1], '@'); assert.equal(tab.formats[1][1], '@');
  e.event_date = '2026-11-06'; e.start_time = '09:00:00'; e.end_time = '11:30:00'; h.send(e, registration('a', 'a2'));
  assert.match(tab.values[1][1], /Friday 6 November 2026 • 09:00–11:30 • =Untrusted location • Updated/);
  assert.ok(h.dateCalls.some(c => c[1] === 'UTC' && c[2] === 'EEEE d MMMM yyyy')); assert.ok(h.dateCalls.some(c => c[1] === 'Asia/Bangkok'));
  tab.fail = (op, at) => { if ((op === 'values' && at.row === 1) || op === 'style') throw new Error('Presentation failure'); };
  h.send(e, registration('a', 'a3')); assert.equal(dataRows(tab).length, 3); assert.ok(h.warnings.some(w => /title\/summary/.test(w))); assert.ok(h.warnings.some(w => /styling/.test(w)));
});

test('filter criteria survive width/capacity changes while the filter stays stable for ordinary appends', () => {
  const h = harness(), e = event('a'); h.send(e, registration('a', 'a1')); const tab = tabFor(h, e), first = tab.filter, criteria = { hiddenValues: ['cancelled'] };
  tab.filter.setColumnFilterCriteria(8, criteria); h.send(e, registration('a', 'a2')); assert.equal(tab.filter, first);
  e.form_schema.push({ id: 'q2', label: 'More', type: 'long_text' }); h.send(e, registration('a', 'a3'));
  assert.notEqual(tab.filter, first); assert.equal(tab.filter.getColumnFilterCriteria(8), criteria);
  tab.rows = tab.getLastRow() + 1; h.send(e, registration('a', 'a4'));
  assert.ok(tab.rows >= tab.getLastRow() + 1); assert.equal(tab.filter.getColumnFilterCriteria(8), criteria);
  assert.equal(tab.filter.range, `4,1,${tab.rows - 3},11`); assert.equal(tab.bandings.length, 1);
});

test('menu quantities, grids in field order with unknown rows, booleans and booth text', () => {
  const h = harness(), e = event('a'); e.form_schema = [
    { id: 'menu', type: 'menu_quantity' }, { id: 'grid', type: 'grid', rows: ['First', 'Second'] },
    { id: 'checks', type: 'checkbox_grid', rows: ['First'] }, { id: 'bool', type: 'checkbox' },
  ];
  const answer = (id, value) => h.ctx.sheetsValue({ key: 'answer:' + id }, e, { data: { [id]: value } });
  assert.equal(answer('menu', { Chairs: 4, Tables: 2, None: 0, Negative: -1 }), 'Chairs × 4, Tables × 2');
  assert.equal(answer('grid', { Second: 'B', Other: 'C', First: 'A' }), 'First: A; Second: B; Other: C');
  assert.equal(answer('checks', { First: ['A', 'B'], Other: ['C'] }), 'First: A, B; Other: C');
  assert.equal(answer('bool', true), 'Yes'); assert.equal(answer('bool', false), 'No');
  assert.equal(h.ctx.sheetsValue({ key: 'booth' }, e, { registration_booths: [{ booths: { label: 'A', number: 1 } }, { booths: { label: 'B', number: 2 } }] }), '1 + 2');
});

test('fingerprints use deterministic nested key order and cover every formatting input', () => {
  const h = harness(), e = event('a'); e.form_schema = [{ id: 'r', type: 'repeat_group', label: 'Kids', subFields: [{ id: 'n', label: 'Name', type: 'text' }], options: ['A'], rows: ['X'], itemLabel: 'Child', countMode: 'add' }];
  const fingerprint = h.ctx.sheetsFingerprint(e), reordered = plain(e);
  reordered.form_schema[0].subFields[0] = { type: 'text', label: 'Name', id: 'n' };
  assert.equal(h.ctx.sheetsFingerprint(reordered), fingerprint); assert.match(fingerprint, /^[0-9a-f]{8}$/);
  for (const key of ['id', 'type', 'label', 'mapTo', 'collectNames', 'options', 'rows', 'subFields', 'itemLabel', 'countMode']) {
    const changed = plain(e); changed.form_schema[0][key] = key === 'collectNames' ? true : ['options', 'rows', 'subFields'].includes(key) ? ['changed'] : 'changed';
    assert.notEqual(h.ctx.sheetsFingerprint(changed), fingerprint, key);
  }
});
const header = s => s.notes.findIndex(row => row?.[0]?.startsWith('headstart:') && JSON.parse(row[0].slice(10)).key === 'id');
const column = (s, key) => s.notes[header(s)].findIndex(n => n && n.startsWith('headstart:') && JSON.parse(n.slice(10)).key === key);
const cell = (s, id, key) => s.values.find(r => r?.[0] === id)?.[column(s, key)];
const flags = (s, key) => JSON.parse(s.notes[header(s)][column(s, key)].slice(10)).flags || {};
const dataRows = s => s.values.slice(header(s) + 1).filter(r => r?.[0]);
const tabFor = (h, e) => h.book(h.ctx.sheetsDestination(e.settings.googleSheetUrl)).sheets.find(s => metadata(s, 'headstart_event') === 'https://test.supabase.co#' + e.id);
const oldColumns = ['id', 'reference', 'created_at', 'event', 'name', 'email', 'phone', 'booth', 'status'];
function legacy(h, e, rows, claimed = false) {
  const book = h.book(h.ctx.sheetsDestination(e.settings.googleSheetUrl)), tab = book.insertSheet('Registrations');
  const columns = oldColumns.concat(e.form_schema.map(f => 'answer:' + f.id));
  tab.values = [columns.slice(), ...rows.map(r => columns.map(key => key.startsWith('answer:') ? r.data?.[key.slice(7)] ?? '' : key === 'event' ? e.name : r[key] ?? ''))];
  tab.notes = [columns.map(key => 'headstart:' + JSON.stringify({ key, label: key }))];
  (claimed ? tab : book).addDeveloperMetadata('headstart_event', 'https://test.supabase.co#' + e.id);
  return tab;
}
function capPages(h, cap = 2) {
  const read = h.ctx.supabaseGet;
  h.ctx.supabaseGet = path => path.includes('/registrations?') ? read(path).slice(0, cap) : read(path);
}

test('requested tab names, staff renames, app renames and case-insensitive collisions', () => {
  const h = harness(), a = event('a', 'shared'), b = event('b', 'shared');
  a.settings.googleSheetTab = 'Friday Market'; b.name = 'Friday Market';
  h.send(a, registration('a', 'a1')); h.send(b, registration('b', 'b1'));
  const sa = tabFor(h, a), sb = tabFor(h, b);
  assert.equal(sa.name, 'Friday Market'); assert.equal(sb.name, 'Friday Market (2)');
  sa.setName('Staff rename'); h.send(a, registration('a', 'a2')); assert.equal(sa.name, 'Staff rename');
  a.settings.googleSheetTab = 'Next market'; h.send(a, registration('a', 'a3')); assert.equal(sa.name, 'Next market');
  assert.equal(dataRows(sb).length, 1);
  b.name = 'NEXT MARKET'; h.send(b, registration('b', 'b2')); assert.equal(sb.name, 'NEXT MARKET (2)');
});

test('other-event workbook claims block nothing and a new blank workbook reuses its single tab', () => {
  const h = harness(), e = event('a'), book = h.book('sheet-a'), occupied = book.insertSheet('Registrations');
  occupied.values = [['Staff records']]; book.addDeveloperMetadata('headstart_event', 'https://test.supabase.co#other');
  h.send(e, registration('a', 'a1')); assert.deepEqual(occupied.values, [['Staff records']]); assert.equal(book.sheets.length, 2);
  const b = event('b'), blank = h.book('sheet-b').insertSheet('Sheet1');
  h.send(b, registration('b', 'b1')); assert.equal(tabFor(h, b), blank); assert.equal(blank.name, b.name);
});

test('duplicate tab claims report both tab names without changing cells', () => {
  const h = harness(), e = event('a'), book = h.book('sheet-a');
  for (const name of ['Original', 'Copy']) book.insertSheet(name).addDeveloperMetadata('headstart_event', 'https://test.supabase.co#a');
  assert.throws(() => h.send(e, registration('a', 'a1')), /Original, Copy.*Delete the copy/);
  assert.ok(book.sheets.every(s => !s.values.length));
});

test('claim failure recovers the blank inserted tab with regex characters and collision suffix', () => {
  const h = harness(), e = event('a'), book = h.book('sheet-a'); e.name = 'Friday (Market)';
  book.insertSheet(e.name).values = [['Keep']]; book.failClaim = true;
  assert.throws(() => h.send(e, registration('a', 'a1')), /Claim failure/);
  assert.equal(book.sheets.length, 2); assert.equal(book.sheets[1].name, 'Friday (Market) (2)');
  book.failClaim = false; book.sheets[1].fail = null;
  h.send(e, registration('a', 'a1')); assert.equal(book.sheets.length, 2); assert.equal(dataRows(book.sheets[1]).length, 1);
});

test('invalid tab names use fallbacks; cosmetic rename failures do not block rows', () => {
  const h = harness(), e = event('a'); e.name = 'Friday / Market?';
  h.send(e, registration('a', 'a1')); const tab = tabFor(h, e); assert.equal(tab.name, 'Friday - Market-');
  e.settings.googleSheetTab = 'New'; tab.fail = op => { if (op === 'rename') throw new Error('Rename unavailable'); };
  h.send(e, registration('a', 'a2')); assert.equal(dataRows(tab).length, 2); assert.match(h.warnings.at(-1), /rename skipped/);
  const b = event('b'), book = h.book('sheet-b'), insert = book.insertSheet.bind(book);
  book.insertSheet = name => { if (!name.startsWith('Event ')) throw new Error('Rejected'); const tab = insert(name); tab.fail = op => { if (op === 'rename') throw new Error('Rejected'); }; return tab; };
  h.send(b, registration('b', 'b1')); assert.equal(tabFor(h, b).name, 'Event b');
});

test('recovery recognises double-digit suffixes, truncated long names and sanitized fallback names', () => {
  for (const [wanted, leftover] of [['Friday (Market)', 'Friday (Market) (12)'], ['X'.repeat(100), 'X'.repeat(95) + ' (12)'], ['Friday / Market?', 'Friday - Market-']]) {
    const h = harness(), e = event('a'), book = h.book('sheet-a'); e.name = wanted;
    book.insertSheet('Staff').values = [['Keep']]; const tab = book.insertSheet(leftover);
    h.send(e, registration('a', 'a1')); assert.equal(tabFor(h, e), tab); assert.equal(book.sheets.length, 2);
  }
});

test('legacy adoption preserves archival rows, folds contacts, converts numeric text and refreshes live rows', () => {
  const e = event(uuid(1)); e.form_schema = [{ id: 'mail', label: 'Your email', type: 'email', mapTo: 'email' }, { id: 'n', label: 'Tickets', type: 'number' }];
  e.settings.googleSheetTotals = ['n']; e.settings.googleSheetTab = 'Requested tab';
  const live = { ...registration(e.id, uuid(2), { mail: 'new@example.com', n: '4.5' }), email: 'admin@example.com' };
  const archived = { ...registration(e.id, uuid(3), { mail: 'old@example.com', n: '12' }), email: 'base@example.com' };
  const h = harness([e], [live]), tab = legacy(h, e, [live, archived]);
  const result = h.refresh(e);
  assert.equal(result.updated, 1); assert.equal(header(tab), 3); assert.equal(tab.name, 'Requested tab');
  assert.equal(dataRows(tab).length, 2); assert.ok(tab.hidden.includes(column(tab, 'event') + 1));
  assert.equal(cell(tab, archived.id, 'email'), 'base@example.com\nForm answer: old@example.com');
  assert.equal(cell(tab, archived.id, 'answer:n'), 12); assert.equal(cell(tab, live.id, 'answer:n'), 4.5);
  assert.equal(flags(tab, 'answer:mail').merged, 'email'); assert.equal(flags(tab, 'answer:n').num, true);
  const n = column(tab, 'answer:n'), letter = h.ctx.sheetsColumnLetter(n + 1);
  assert.equal(tab.formulas[2][n], `=SUBTOTAL(109,${letter}5:${letter})`); assert.equal(tab.formats[2][n], '#,##0.0#');
  assert.equal(tab.formats[5][n], '#,##0'); assert.equal(tab.formats[4][n], '#,##0.0#########');
  assert.equal(metadata(tab, 'headstart_refresh_needed'), undefined);
});

test('invalid legacy and already-claimed old headers cause no claim, insertion, flags or cell changes', () => {
  for (const claimed of [false, true]) for (const corruption of ['bad-json', 'missing', 'duplicate', 'id-position']) {
    const h = harness(), e = event('a'), tab = legacy(h, e, [registration('a', 'a1')], claimed);
    if (corruption === 'bad-json') tab.notes[0][4] = 'headstart:{';
    if (corruption === 'missing') tab.notes[0][4] = '';
    if (corruption === 'duplicate') tab.notes[0][4] = tab.notes[0][5];
    if (corruption === 'id-position') [tab.notes[0][0], tab.notes[0][1]] = [tab.notes[0][1], tab.notes[0][0]];
    const before = plain([tab.values, tab.notes, tab.rows, tab.metadata.map(m => [m.getKey(), m.getValue()])]);
    assert.throws(() => h.send(e, registration('a', 'a2')), /notes/);
    assert.deepEqual(plain([tab.values, tab.notes, tab.rows, tab.metadata.map(m => [m.getKey(), m.getValue()])]), before);
  }
});

test('duplicate header discovery fails, and headers moved below row 4 drive all ranges and formulas', () => {
  const h = harness(), e = event('a'); h.send(e, registration('a', 'a1')); const tab = tabFor(h, e);
  tab.notes[7] = tab.notes[3].slice(); assert.throws(() => h.send(e, registration('a', 'a2')), /Multiple managed/);
  tab.notes[7] = []; tab.insertRowsBefore(4, 3); h.send(e, registration('a', 'a2'));
  assert.equal(header(tab), 6); assert.equal(tab.frozen, 7); assert.equal(tab.values[8][0], 'a2');
  assert.match(tab.formulas[5][1], /A8:A/); assert.equal(tab.filter.range, `7,1,${tab.rows - 6},10`);
});

test('notes-first header write and failure after old-row insertion both recover', () => {
  const h = harness(), e = event('a'), tab = h.book('sheet-a').insertSheet(e.name);
  tab.fail = (op, at) => { if (op === 'values' && at.row === 4) throw new Error('Header failure'); };
  assert.throws(() => h.send(e, registration('a', 'a1')), /Header failure/);
  assert.equal(tab.getLastRow(), 0); assert.equal(tab.getLastColumn(), 0); assert.ok(tab.notes[3][0]);
  tab.fail = null; h.send(e, registration('a', 'a1')); assert.equal(dataRows(tab).length, 1);
  const b = event('b'), old = legacy(h, b, [registration('b', 'b1')]);
  old.fail = op => { if (op === 'hide') throw new Error('Migration failure'); };
  assert.throws(() => h.send(b, registration('b', 'b2')), /Migration failure/); assert.equal(header(old), 3);
  old.fail = null; h.send(b, registration('b', 'b2')); assert.equal(header(old), 3); assert.equal(dataRows(old).length, 2);
});

test('mapping transitions fold archived answers into the new contact and unmerge complete hidden data', () => {
  const h = harness(), e = event('a'); e.form_schema = [{ id: 'c', label: 'Contact', type: 'long_text', mapTo: 'email' }];
  const reg = { ...registration('a', 'deleted', { c: 'Form value 456' }), email: 'Original email', phone: '123' }, tab = legacy(h, e, [reg]);
  h.ctx.writeEventRows(e, [], false); const oldEmail = cell(tab, 'deleted', 'email');
  e.form_schema[0].mapTo = 'phone'; h.ctx.writeEventRows(e, [], false);
  assert.equal(cell(tab, 'deleted', 'phone'), '123\nForm answer: Form value 456');
  assert.equal(cell(tab, 'deleted', 'email'), oldEmail); assert.equal(flags(tab, 'answer:c').merged, 'phone');
  h.send(e, registration('a', 'live', { c: 'New answer' })); assert.equal(cell(tab, 'live', 'answer:c'), 'New answer');
  delete e.form_schema[0].mapTo; h.ctx.writeEventRows(e, [], false);
  assert.equal(flags(tab, 'answer:c').merged, undefined); assert.ok(!tab.hidden.includes(column(tab, 'answer:c') + 1));
  assert.equal(cell(tab, 'deleted', 'answer:c'), 'Form value 456'); assert.equal(cell(tab, 'live', 'answer:c'), 'New answer');
});

test('partially persisted folds and number conversions retry without duplication or lost archived rows', () => {
  for (const failure of ['fold', 'number']) {
    const h = harness(), e = event('a'); e.form_schema = [{ id: 'c', label: 'Email', type: 'email', mapTo: 'email' }, { id: 'n', label: 'Count', type: 'number' }]; e.settings.googleSheetTotals = ['n'];
    const tab = legacy(h, e, [1, 2].map(n => ({ ...registration('a', `deleted${n}`, { c: 'Line one\nLine two', n: String(n) }), email: 'Base' })));
    const target = failure === 'fold' ? 6 : 11;
    tab.fail = (op, at) => { if (op === 'values' && at.row === 6 && at.col === target) throw new Error('Midway failure'); };
    assert.throws(() => h.ctx.writeEventRows(e, [], false), /Midway failure/);
    assert.equal(cell(tab, 'deleted1', failure === 'fold' ? 'email' : 'answer:n'), failure === 'fold' ? 'Base\nForm answer: Line one\nLine two' : 1);
    assert.equal(flags(tab, failure === 'fold' ? 'answer:c' : 'answer:n')[failure === 'fold' ? 'merged' : 'num'], undefined);
    tab.fail = null; h.ctx.writeEventRows(e, [], false); h.ctx.writeEventRows(e, [], false);
    for (const id of ['deleted1', 'deleted2']) {
      assert.equal(cell(tab, id, 'email'), 'Base\nForm answer: Line one\nLine two'); assert.equal(typeof cell(tab, id, 'answer:n'), 'number');
    }
  }
});

test('contact exclusion clears legacy answers once; reinclusion needs a later refresh', () => {
  const e = event(uuid(1)); e.form_schema = [{ id: 'c', label: 'Email', type: 'email', mapTo: 'email' }];
  const live = { ...registration(e.id, uuid(2), { c: 'form@example.com' }), email: 'base@example.com' };
  const h = harness([e], [live]), tab = legacy(h, e, [live, { ...live, id: 'deleted' }]);
  h.ctx.writeEventRows(e, [], false); e.settings.googleSheetExclude = ['email']; h.refresh(e);
  for (const key of ['email', 'answer:c']) {
    assert.equal(cell(tab, 'deleted', key), ''); assert.equal(cell(tab, live.id, key), ''); assert.equal(flags(tab, key).excluded, true);
  }
  const before = tab.calls.filter(c => c[0] === 'clear' && c[1] > 4).length;
  h.send(e, { ...live, id: uuid(3) });
  assert.equal(tab.calls.filter(c => c[0] === 'clear' && c[1] > 4).length, before);
  assert.equal(metadata(tab, 'headstart_refresh_needed'), undefined);
  e.settings.googleSheetExclude = []; h.ctx.writeEventRows(e, [], false);
  assert.ok(metadata(tab, 'headstart_refresh_needed')); assert.match(tab.formulas[2][1], /New columns/);
  h.refresh(e); assert.equal(metadata(tab, 'headstart_refresh_needed'), undefined); assert.equal(cell(tab, 'deleted', 'email'), '');
  assert.equal(cell(tab, live.id, 'email'), 'base@example.com\nForm answer: form@example.com');
  e.settings.googleSheetExclude = ['answer:c']; h.ctx.writeEventRows(e, [], false); assert.equal(cell(tab, live.id, 'email'), '');
});

test('a refresh started before the refresh-needed timestamp does not clear it', () => {
  const e = event(uuid(1)), regs = Array.from({ length: 21 }, (_, i) => registration(e.id, uuid(i + 100))), h = harness([e], regs); capPages(h, 1);
  const first = h.refresh(e), tab = tabFor(h, e), run = JSON.parse(metadata(tab, 'headstart_refresh'));
  const needed = new Date(new Date(run.started).getTime() + 10000).toISOString(); h.ctx.sheetsMetaSet(tab, 'headstart_refresh_needed', needed);
  assert.equal(h.refresh(e, { runId: first.runId }).complete, true); assert.equal(metadata(tab, 'headstart_refresh_needed'), needed);
});

test('refresh restarts for missing or wrong run IDs, legacy cursors, new destination tabs/books and schema formatting changes', () => {
  for (const change of ['missing', 'wrong', 'legacy', 'book', 'tab', 'schema', 'totals', 'exclude', 'request']) {
    const e = event(uuid(1)), regs = Array.from({ length: 21 }, (_, i) => registration(e.id, uuid(i + 100)));
    e.form_schema = [{ id: 'r', type: 'repeat_group', label: 'Kids', subFields: [{ id: 'n', label: 'Name' }], itemLabel: 'Child' }];
    const h = harness([e], regs); capPages(h, 1); const first = h.refresh(e), previous = tabFor(h, e);
    const request = { runId: first.runId };
    if (change === 'missing') delete request.runId;
    if (change === 'wrong') request.runId = 'wrong';
    if (change === 'legacy') { delete request.runId; request.cursor = uuid(999); }
    if (change === 'book') e.settings.googleSheetUrl = url('new-book');
    if (change === 'tab') { previous.metadata.find(m => m.getKey() === 'headstart_event').remove(); }
    if (change === 'schema') e.form_schema[0].subFields[0].label = 'Full name';
    if (change === 'totals') e.settings.googleSheetTotals = ['r'];
    if (change === 'exclude') e.settings.googleSheetExclude = ['phone'];
    if (change === 'request') e.settings.googleSheetTab = 'Next market';
    h.queries.length = 0; const next = h.refresh(e, request);
    assert.notEqual(next.runId, first.runId, change); assert.equal(next.complete, false, change);
    assert.equal(next.restarted, change !== 'missing', change);
    assert.equal(new URL('https://test.invalid' + h.queries.find(q => q.includes('/registrations?'))).searchParams.get('id'), null, change);
    assert.equal(JSON.parse(metadata(tabFor(h, e), 'headstart_refresh')).cursor, uuid(119));
  }
});

test('refresh of an empty event creates its tab and continuation HTML uses only server run IDs', () => {
  const e = event(uuid(1)), h = harness([e]); const result = h.refresh(e), tab = tabFor(h, e);
  assert.equal(result.complete, true); assert.equal(dataRows(tab).length, 0); assert.equal(header(tab), 3);
  assert.match(h.queries[0], /event_date,start_time,end_time,location/);
  h.ctx.refreshEventSheet = () => ({ complete: false, added: 1, updated: 2, runId: 'run', url: url('abc'), gid: 123, tabName: '<script>"Tab"</script>', restarted: true });
  const html = h.ctx.sheetRefreshPage({ eventId: e.id, accessToken: '"<secret>' });
  assert.match(html, /#gid=123/); assert.match(html, /Refresh restarted/); assert.ok(!html.includes('<script>')); assert.ok(!html.includes('cursor'));
  assert.match(html, /&quot;runId&quot;:&quot;run&quot;/); assert.match(html, /no-referrer/);
});

test('number and slider cells stay text until totals are explicitly selected', () => {
  const h = harness(), e = event('a');
  e.form_schema = [{ id: 'n', type: 'number', label: 'Count' }, { id: 's', type: 'slider', label: 'Score' }];
  const tab = legacy(h, e, [registration('a', 'archived', { n: '12', s: '3.5' })]);
  h.send(e, registration('a', 'live', { n: 12, s: 3.5 }));
  for (const id of ['archived', 'live']) {
    assert.equal(cell(tab, id, 'answer:n'), '12'); assert.equal(cell(tab, id, 'answer:s'), '3.5');
  }
  assert.equal(tab.formats[5][column(tab, 'answer:n')], '@');
  assert.equal(tab.formats[5][column(tab, 'answer:s')], '@');
  e.settings.googleSheetTotals = ['n']; h.ctx.writeEventRows(e, [], false);
  for (const id of ['archived', 'live']) {
    assert.equal(cell(tab, id, 'answer:n'), 12); assert.equal(cell(tab, id, 'answer:s'), '3.5');
  }
  h.send(e, registration('a', 'next', { n: '2.5', s: 4 }));
  assert.equal(cell(tab, 'next', 'answer:n'), 2.5); assert.equal(cell(tab, 'next', 'answer:s'), '4');
});

test('header flags are saved in one changed-notes batch and unchanged writes skip notes', () => {
  const h = harness(), e = event('a');
  e.form_schema = [{ id: 'mail', type: 'email', label: 'Email', mapTo: 'email' }, { id: 'n', type: 'number', label: 'Count' }];
  e.settings.googleSheetTotals = ['n'];
  const tab = legacy(h, e, [{ ...registration('a', 'archived', { mail: 'answer@example.com', n: '3' }), email: 'base@example.com' }]);
  h.ctx.writeEventRows(e, [], false);
  const writes = tab.calls.filter(c => c[0] === 'notes');
  assert.equal(writes.length, 2); assert.equal(writes.at(-1)[4], tab.getLastColumn());
  tab.calls = []; h.send(e, registration('a', 'next'));
  assert.equal(tab.calls.filter(c => c[0] === 'notes').length, 0);
  e.form_schema[1].label = 'Tickets'; tab.calls = []; h.ctx.writeEventRows(e, [], false);
  assert.equal(tab.calls.filter(c => c[0] === 'notes').length, 1);
  assert.equal(tab.values[3][column(tab, 'answer:n')], 'Tickets');
});

test('interrupted batched flag persistence retries completed transformations safely', () => {
  const h = harness(), e = event('a');
  e.form_schema = [{ id: 'mail', type: 'email', label: 'Email', mapTo: 'email' }, { id: 'n', type: 'number', label: 'Count' }];
  e.settings.googleSheetTotals = ['n'];
  const tab = legacy(h, e, [{ ...registration('a', 'archived', { mail: 'answer@example.com', n: '3' }), email: 'base@example.com' }]);
  tab.fail = (op, at) => { if (op === 'notes' && at.col === 10) throw new Error('Flag write failure'); };
  assert.throws(() => h.ctx.writeEventRows(e, [], false), /Flag write failure/);
  assert.equal(cell(tab, 'archived', 'email'), 'base@example.com\nForm answer: answer@example.com');
  assert.equal(cell(tab, 'archived', 'answer:n'), 3); assert.equal(flags(tab, 'answer:mail').merged, undefined);
  tab.fail = null; h.ctx.writeEventRows(e, [], false);
  assert.equal(cell(tab, 'archived', 'email'), 'base@example.com\nForm answer: answer@example.com');
  assert.equal(cell(tab, 'archived', 'answer:n'), 3); assert.equal(flags(tab, 'answer:mail').merged, 'email');
});

test('heading visibility probes stop after finding the title and non-total summary columns', () => {
  const h = harness(), e = event('a'); h.send(e, registration('a', 'a1')); const tab = tabFor(h, e);
  assert.deepEqual(tab.calls.filter(c => c[0] === 'isColumnHiddenByUser'), [['isColumnHiddenByUser', 2]]);
  assert.equal(tab.formats[2][1], '#,##0');
  tab.hideColumns(2); tab.calls = []; h.send(e, registration('a', 'a2'));
  assert.deepEqual(tab.calls.filter(c => c[0] === 'isColumnHiddenByUser'), [['isColumnHiddenByUser', 2], ['isColumnHiddenByUser', 3]]);
  assert.equal(tab.formats[2][2], '#,##0');
  e.form_schema = [{ id: 'n', type: 'number', label: 'Count' }, { id: 'text', type: 'paragraph', label: 'Notes' }];
  e.settings.googleSheetExclude = oldColumns.filter(k => !['id', 'event'].includes(k)).concat('vendor_type', 'answer:q1');
  e.settings.googleSheetTotals = ['n']; tab.calls = []; h.ctx.writeEventRows(e, [], false);
  assert.deepEqual(tab.calls.filter(c => c[0] === 'isColumnHiddenByUser').map(c => c[1]), [column(tab, 'answer:n') + 1, column(tab, 'answer:text') + 1]);
  assert.equal(tab.values[0][column(tab, 'answer:n')], e.name);
  assert.match(tab.formulas[2][column(tab, 'answer:text')], /responses/);
});

test('refresh decorates once per request, including partial and empty batches; registrations still decorate', () => {
  const e = event(uuid(1)), regs = Array.from({ length: 21 }, (_, i) => registration(e.id, uuid(i + 100)));
  const h = harness([e], regs); capPages(h, 1);
  let count = 0; const decorate = h.ctx.sheetsDecorate;
  h.ctx.sheetsDecorate = (...args) => { count++; return decorate(...args); };
  const first = h.refresh(e); assert.equal(first.complete, false); assert.equal(count, 1);
  count = 0; assert.equal(h.refresh(e, { runId: first.runId }).complete, true); assert.equal(count, 1);
  count = 0; h.send(e, registration(e.id, uuid(999))); assert.equal(count, 1);
  const empty = event(uuid(2)); h.ctx.supabaseGet = path => path.includes('/events?') ? [empty] : [];
  count = 0; h.refresh(empty); assert.equal(count, 1);
});

test('refresh-needed notes exclude unmerges and excluded appends but include sent appends and reinclusions', () => {
  const h = harness(), e = event('a'); e.form_schema = [{ id: 'c', type: 'paragraph', label: 'Contact', mapTo: 'email' }];
  const tab = legacy(h, e, [registration('a', 'archived', { c: 'answer@example.com' })]);
  h.ctx.writeEventRows(e, [], false); h.ctx.sheetsMetaSet(tab, 'headstart_refresh_needed', null); delete e.form_schema[0].mapTo; h.ctx.writeEventRows(e, [], false);
  assert.equal(metadata(tab, 'headstart_refresh_needed'), undefined); assert.equal(cell(tab, 'archived', 'answer:c'), 'answer@example.com');
  e.form_schema.push({ id: 'private', type: 'paragraph', label: 'Private' });
  e.settings.googleSheetExclude = ['answer:private']; h.ctx.writeEventRows(e, [], false);
  assert.equal(metadata(tab, 'headstart_refresh_needed'), undefined); assert.equal(flags(tab, 'answer:private').excluded, true);
  e.settings.googleSheetExclude = []; h.ctx.writeEventRows(e, [], false);
  assert.ok(metadata(tab, 'headstart_refresh_needed'));
  h.ctx.sheetsMetaSet(tab, 'headstart_refresh_needed', null);
  e.form_schema.push({ id: 'new', type: 'paragraph', label: 'New' }); h.ctx.writeEventRows(e, [], false);
  assert.ok(metadata(tab, 'headstart_refresh_needed'));
});

function frontendHelpers() {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/lib/googleSheets.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, mod);
  return mod.exports;
}

test('column choices mirror server exclusions, contact units, ordering and Reference fallback', () => {
  const ui = frontendHelpers(), h = harness(), e = event('a');
  e.form_schema = [{ id: 'heading', type: 'heading', label: 'Header' }, { id: 'n', type: 'short_text', label: 'Your name' },
    { id: 'mail', type: 'email', label: 'Contact', mapTo: 'email' }, { id: 'count', type: 'number', label: 'Count' }];
  for (const exclude of [[], ['email'], ['answer:mail'], ['name', 'answer:n', 'answer:mail', 'phone', 'booth', 'created_at', 'status', 'reference', 'answer:count']]) {
    e.settings.googleSheetExclude = exclude;
    const choices = ui.sheetColumnChoices(e.form_schema, e.settings), plan = h.ctx.sheetsPlan(e);
    assert.deepEqual(plain(choices.map(c => c.key)), plain(plan.all.filter(c => c.key !== 'id').map(c => c.key)));
    for (const c of choices) {
      const target = plan.all.find(p => p.key === c.key);
      assert.equal(c.sent, !target.excluded, c.key); assert.equal(c.label, target.label); assert.equal(c.mergedInto, target.merged);
    }
    assert.equal(choices.find(c => c.key === 'email').label, 'Email — Contact');
  }
});

test('column selection changes both contact keys and cannot untick the last independent column', () => {
  const ui = frontendHelpers(), fields = [{ id: 'mail', type: 'email', label: 'Email', mapTo: 'email' }, { id: 'n', type: 'number', label: 'Count' }];
  const settings = { googleSheetExclude: ['unknown', 'answer:mail'] };
  const included = ui.sheetColumnExclusions(fields, settings, 'email', true);
  assert.deepEqual(plain(included), ['unknown']); assert.deepEqual(settings.googleSheetExclude, ['unknown', 'answer:mail']);
  assert.deepEqual(plain(ui.sheetColumnExclusions(fields, { googleSheetExclude: included }, 'answer:mail', false)), ['unknown', 'email', 'answer:mail']);
  let state = { googleSheetExclude: [] };
  for (const c of ui.sheetColumnChoices(fields, state).filter(c => !c.mergedInto && c.key !== 'email')) {
    state.googleSheetExclude = ui.sheetColumnExclusions(fields, state, c.key, false);
  }
  const before = plain(state.googleSheetExclude);
  state.googleSheetExclude = ui.sheetColumnExclusions(fields, state, 'email', false);
  assert.deepEqual(plain(state.googleSheetExclude), before);
  assert.deepEqual(plain(ui.sheetColumnChoices(fields, state).filter(c => c.sent && !c.mergedInto).map(c => c.key)), ['email']);
  assert.deepEqual(plain(ui.sheetColumnExclusions(fields, state, 'id', false)), before);
  state.googleSheetExclude = ui.sheetColumnExclusions(fields, state, 'answer:n', true);
  state.googleSheetExclude = ui.sheetColumnExclusions(fields, state, 'email', false);
  assert.deepEqual(plain(ui.sheetColumnChoices(fields, state).filter(c => c.sent && !c.mergedInto).map(c => c.key)), ['answer:n']);
});

test('shared-sheet lookup matches file IDs, excludes this event and resolves requested names', () => {
  const ui = frontendHelpers();
  const events = [
    { id: 'self', name: 'Current', googleSheetUrl: url('shared') },
    { id: 'same', name: 'Other event', googleSheetUrl: url('shared') + '#gid=123', googleSheetTab: '  Friday\n Market  ' },
    { id: 'fallback', name: 'Event name', googleSheetUrl: url('shared'), googleSheetTab: '' },
    { id: 'other', name: 'Other file', googleSheetUrl: url('different') },
    { id: 'invalid', name: 'Invalid', googleSheetUrl: 'https://evil.example/spreadsheets/d/shared' },
    { id: 'blank', name: 'Blank', googleSheetUrl: null },
  ];
  assert.deepEqual(plain(ui.sheetSharedEvents(events, 'self', 'shared')), [
    { id: 'same', name: 'Other event', tabName: 'Friday Market' }, { id: 'fallback', name: 'Event name', tabName: 'Event name' },
  ]);
  assert.deepEqual(plain(ui.sheetSharedEvents(events, 'self', null)), []);
});

test('retired merged answers remain hidden and follow contact exclusion for live and archived rows', () => {
  const e = event(uuid(1)); e.form_schema = [{ id: 'mail', label: 'Email', type: 'email', mapTo: 'email' }];
  const live = { ...registration(e.id, uuid(2), { mail: 'live-form@example.com' }), email: 'live-base@example.com' };
  const archived = { ...registration(e.id, 'archived', { mail: 'old-form@example.com' }), email: 'old-base@example.com' };
  const h = harness([e], [live]), tab = legacy(h, e, [live, archived]);
  h.refresh(e); e.form_schema = []; h.refresh(e);
  const retired = column(tab, 'answer:mail');
  assert.equal(flags(tab, 'answer:mail').merged, 'email'); assert.ok(tab.hidden.includes(retired + 1));
  assert.equal(cell(tab, 'archived', 'answer:mail'), 'old-form@example.com');
  live.data.mail = 'edited-form@example.com'; h.refresh(e);
  assert.equal(cell(tab, live.id, 'answer:mail'), 'edited-form@example.com', 'retired hidden answers still update from registration data');
  e.settings.googleSheetExclude = ['email']; h.refresh(e);
  for (const id of [live.id, archived.id]) for (const key of ['email', 'answer:mail']) assert.equal(cell(tab, id, key), '');
  for (const row of tab.values) row.forEach((value, i) => {
    if (!tab.hidden.includes(i + 1)) assert.ok(!String(value).includes('@example.com'), 'private addresses must not remain visible');
  });
  assert.equal(flags(tab, 'answer:mail').merged, 'email');
  const show = tab.showColumns.bind(tab), shown = [];
  tab.showColumns = col => { shown.push(col); return show(col); };
  e.settings.googleSheetExclude = []; h.refresh(e);
  assert.ok(!tab.hidden.includes(column(tab, 'email') + 1)); assert.ok(tab.hidden.includes(retired + 1));
  assert.ok(!shown.includes(retired + 1)); assert.equal(flags(tab, 'answer:mail').merged, 'email');
  assert.equal(cell(tab, 'archived', 'answer:mail'), '');
  assert.equal(cell(tab, live.id, 'answer:mail'), 'edited-form@example.com');
  // Removing a retired question column in Sheets must not append it again.
  for (const store of [tab.values, tab.notes, tab.formats, tab.formulas]) store.forEach(row => row.splice(retired, 1));
  tab.columns--; tab.hidden = tab.hidden.filter(c => c !== retired + 1).map(c => c > retired + 1 ? c - 1 : c);
  h.refresh(e); assert.equal(column(tab, 'answer:mail'), -1);
});

test('retired merges also follow exclusion through a replacement contact source', () => {
  const h = harness(), e = event('a'); e.form_schema = [{ id: 'old', label: 'Email', type: 'email', mapTo: 'email' }];
  const tab = legacy(h, e, [registration('a', 'archived', { old: 'private@example.com' })]);
  h.ctx.writeEventRows(e, [], false);
  e.form_schema = [{ id: 'new', label: 'New email', type: 'email', mapTo: 'email' }];
  e.settings.googleSheetExclude = ['answer:new']; h.ctx.writeEventRows(e, [], false);
  assert.equal(cell(tab, 'archived', 'answer:old'), ''); assert.equal(cell(tab, 'archived', 'email'), '');
  assert.equal(flags(tab, 'answer:old').merged, 'email'); assert.equal(flags(tab, 'answer:old').excluded, true);
  e.form_schema = []; h.ctx.writeEventRows(e, [], false);
  assert.ok(tab.hidden.includes(column(tab, 'answer:old') + 1));
});

test('legacy notes with missing labels and old type properties upgrade without blocking export', () => {
  const h = harness(), e = event('a'); e.form_schema = [{ id: 'blank', type: 'paragraph' }, { id: 'old', label: 'Current wording', type: 'paragraph' }];
  const tab = legacy(h, e, [registration('a', 'archived', { blank: 'Unlabelled answer', old: 'Saved answer' })]);
  tab.notes[0][9] = 'headstart:' + JSON.stringify({ key: 'answer:blank', type: 'paragraph' });
  tab.notes[0][10] = 'headstart:' + JSON.stringify({ key: 'answer:old', label: 'Old wording', type: 'paragraph' });
  h.ctx.writeEventRows(e, [], false);
  assert.equal(header(tab), 3); assert.equal(tab.values[3][9], ''); assert.equal(tab.values[3][10], 'Current wording');
  assert.equal(JSON.parse(tab.notes[3][9].slice(10)).label, '');
  assert.equal(cell(tab, 'archived', 'answer:blank'), 'Unlabelled answer');
  e.form_schema.push({ id: 'new', type: 'paragraph' }); h.send(e, registration('a', 'live', { new: 'New answer' }));
  assert.equal(JSON.parse(tab.notes[3][column(tab, 'answer:new')].slice(10)).label, '');
  h.send(e, registration('a', 'next')); assert.equal(cell(tab, 'live', 'answer:new'), 'New answer');
  const fresh = event('fresh'); fresh.form_schema = [{ id: 'blank', type: 'paragraph' }];
  h.send(fresh, registration('fresh', 'f1')); h.send(fresh, registration('fresh', 'f2'));
  assert.equal(tabFor(h, fresh).values[3][column(tabFor(h, fresh), 'answer:blank')], '');
});

test('missing-label compatibility still rejects malformed keys, explicit labels and flags without mutation', () => {
  for (const note of [{ key: '' }, { key: 4 }, { key: 'answer:q1', label: 7 }, { key: 'answer:q1', flags: null }, { key: 'answer:q1', flags: [] }]) {
    const h = harness(), e = event('a'), tab = legacy(h, e, [registration('a', 'archived')]);
    tab.notes[0][9] = 'headstart:' + JSON.stringify(note); const before = plain([tab.values, tab.notes, tab.rows]);
    assert.throws(() => h.ctx.writeEventRows(e, [], false), /notes/); assert.deepEqual(plain([tab.values, tab.notes, tab.rows]), before);
    assert.equal(metadata(tab, 'headstart_event'), undefined);
  }
});

test('decimal format is sticky and normal registration writes never read total-column values', () => {
  const h = harness(), e = event('a'); e.form_schema = [{ id: 'n', label: 'Count', type: 'number' }, { id: 's', label: 'Score', type: 'slider' }];
  e.settings.googleSheetTotals = ['n', 's']; h.send(e, registration('a', 'first', { n: 2, s: 3 })); const tab = tabFor(h, e);
  assert.equal(flags(tab, 'answer:n').decimals, false); assert.equal(tab.formats[2][column(tab, 'answer:n')], '#,##0');
  tab.calls = []; h.send(e, registration('a', 'decimal', { n: 2.5, s: 3.75 }));
  assert.equal(tab.calls.filter(c => c[0] === 'notes').length, 1, 'both decimal flags use one batch');
  assert.ok(tab.calls.filter(c => c[0] === 'getValues').every(c => c[2] === 1), 'only ID lookup is read');
  for (const key of ['answer:n', 'answer:s']) { assert.equal(flags(tab, key).decimals, true); assert.equal(tab.formats[2][column(tab, key)], '#,##0.0#'); }
  tab.calls = []; h.ctx.writeEventRows(e, [registration('a', 'decimal', { n: 2, s: 3 })], true);
  h.send(e, registration('a', 'integer', { n: 4, s: 5 }));
  assert.equal(tab.calls.filter(c => c[0] === 'notes').length, 0);
  assert.ok(tab.calls.filter(c => c[0] === 'getValues').every(c => c[2] === 1));
  assert.equal(tab.formats[2][column(tab, 'answer:n')], '#,##0.0#', 'precision remains after decimal rows become integers');
  e.settings.googleSheetExclude = ['answer:n']; h.ctx.writeEventRows(e, [], false);
  assert.equal(flags(tab, 'answer:n').decimals, true);
  e.settings.googleSheetExclude = []; h.ctx.writeEventRows(e, [], false);
  assert.equal(tab.formats[2][column(tab, 'answer:n')], '#,##0.0#');
});

test('numeric migrations initialise decimal precision from archived rows and upgrade old numeric notes once', () => {
  for (const alreadyNumeric of [false, true]) {
    const h = harness(), e = event('a'); e.form_schema = [{ id: 'n', label: 'Count', type: 'number' }]; e.settings.googleSheetTotals = ['n'];
    const tab = legacy(h, e, [registration('a', 'archived', { n: alreadyNumeric ? 1.25 : '1.25' })]);
    if (alreadyNumeric) tab.notes[0][9] = 'headstart:' + JSON.stringify({ key: 'answer:n', label: 'Count', flags: { num: true } });
    h.ctx.writeEventRows(e, [], false); assert.equal(flags(tab, 'answer:n').decimals, true); assert.equal(cell(tab, 'archived', 'answer:n'), 1.25);
    assert.equal(tab.formats[2][column(tab, 'answer:n')], '#,##0.0#');
    tab.calls = []; h.send(e, registration('a', 'next', { n: 2 }));
    assert.ok(tab.calls.filter(c => c[0] === 'getValues').every(c => c[2] === 1));
  }
});

test('decimal-note failures cannot leave an appended decimal row with integer total formatting', () => {
  const h = harness(), e = event('a'); e.form_schema = [{ id: 'n', label: 'Count', type: 'number' }]; e.settings.googleSheetTotals = ['n'];
  h.send(e, registration('a', 'first', { n: 2 })); const tab = tabFor(h, e);
  tab.fail = (op, at) => { if (op === 'notes' && at.col === 9) throw new Error('Precision note failure'); };
  assert.throws(() => h.send(e, registration('a', 'decimal', { n: 2.5 })), /Precision note failure/);
  assert.equal(cell(tab, 'decimal', 'answer:n'), undefined);
  tab.fail = null; h.send(e, registration('a', 'decimal', { n: 2.5 }));
  assert.equal(flags(tab, 'answer:n').decimals, true); assert.equal(cell(tab, 'decimal', 'answer:n'), 2.5);
  assert.equal(tab.formats[2][column(tab, 'answer:n')], '#,##0.0#');
});

test('tab ownership uses one finder on existing claims and recovery skips unrelated tab probes', () => {
  const h = harness(), e = event('a'); h.send(e, registration('a', 'first')); const book = h.book('sheet-a');
  book.finderCalls = []; assert.equal(h.ctx.sheetsEventTab(book, e), tabFor(h, e));
  assert.deepEqual(book.finderCalls, [{ key: 'headstart_event', value: 'https://test.supabase.co#a' }]);
  const other = event('b'), freshBook = h.book('sheet-b'), staff = freshBook.insertSheet('Staff records');
  staff.getDeveloperMetadata = () => { throw new Error('Unrelated metadata read'); };
  staff.getLastRow = () => { throw new Error('Unrelated data read'); };
  const recovered = freshBook.insertSheet(other.name);
  assert.equal(h.ctx.sheetsEventTab(freshBook, other), recovered);
  assert.equal(freshBook.finderCalls.length, 2);
});

test('booth export separates numeric numbers and vendor labels on refresh', () => {
  const h = harness(), e = event('a');
  const r = { ...registration('a', 'a1'), booths: { number: '21', label: 'Outside Provider' } };
  h.send(e, r);
  const tab = tabFor(h, e);
  assert.equal(cell(tab, 'a1', 'booth'), 21);
  assert.equal(cell(tab, 'a1', 'vendor_type'), 'Outside Provider');
  r.registration_booths = [{ booths: { number: '2', label: 'Outside Provider' } }, { booths: { number: '10', label: 'Outside Provider' } }];
  h.ctx.writeEventRows(e, [r], true);
  assert.equal(cell(tab, 'a1', 'booth'), '2 + 10');
  assert.equal(cell(tab, 'a1', 'vendor_type'), 'Outside Provider');
  assert.equal(h.ctx.sheetsValue({ key: 'booth' }, e, {}), '');
  assert.equal(h.ctx.sheetsValue({ key: 'vendor_type' }, e, {}), '');
});

test('refresh upgrades combined booth cells without duplicating registrations', () => {
  const h = harness(), e = event('a');
  const r = { ...registration('a', 'live'), booths: { number: '21', label: 'Outside Provider' } };
  const tab = legacy(h, e, [r]);
  tab.values[1][oldColumns.indexOf('booth')] = '21 Outside Provider';
  h.ctx.writeEventRows(e, [r], true);
  assert.equal(cell(tab, 'live', 'booth'), 21);
  assert.equal(cell(tab, 'live', 'vendor_type'), 'Outside Provider');
  assert.equal(dataRows(tab).length, 1);
});

test('refresh splits legacy repeating cells and grid rows while preserving the archived source', () => {
  const h = harness(), e = event('split');
  e.form_schema = [{ id: 'kids', label: 'Children', type: 'repeat_group', maxItems: 1,
    subFields: [{ id: 'age', label: 'Age', type: 'number' }] },
    { id: 'grid', label: 'Choices', type: 'checkbox_grid', rows: ['Monday', 'Tuesday'] }];
  const r = registration(e.id, 'live', { kids: [{ age: '7' }, { age: '9' }], grid: { Monday: ['A', 'B'] } });
  const tab = legacy(h, e, [r]);
  const old = h.ctx.sheetsRepeatText(e.form_schema[0], r.data.kids);
  tab.values[1][column(tab, 'answer:kids')] = old;
  h.ctx.writeEventRows(e, [r], true);
  assert.equal(cell(tab, 'live', 'detail:["kids","entry",1,"age"]'), 9);
  assert.equal(cell(tab, 'live', 'detail:["grid","row","Monday"]'), 'A, B');
  assert.equal(cell(tab, 'live', 'detail:["grid","row","Tuesday"]'), '');
  assert.equal(cell(tab, 'live', 'answer:kids'), old);
  assert.equal(dataRows(tab).length, 1);
});

test('repeat columns grow from actual answers across registrations, never the form limit', () => {
  const h = harness(), e = event('used');
  e.form_schema = [{ id: 'kids', type: 'repeat_group', label: 'Children', maxItems: 10,
    subFields: [{ id: 'age', label: 'Age', type: 'number' }] }];
  h.ctx.writeEventRows(e, [], false);
  const tab = tabFor(h, e), key = i => 'detail:' + JSON.stringify(['kids', 'entry', i, 'age']);
  assert.equal(column(tab, key(0)), -1);
  h.send(e, registration(e.id, 'one', { kids: [{ age: '7' }] }));
  assert.equal(cell(tab, 'one', key(0)), 7); assert.equal(column(tab, key(1)), -1);
  h.send(e, registration(e.id, 'three', { kids: [{ age: '4' }, { age: '5' }, { age: '6' }] }));
  h.send(e, registration(e.id, 'two', { kids: [{ age: '8' }, { age: '9' }] }));
  assert.equal(cell(tab, 'three', key(2)), 6); assert.equal(column(tab, key(3)), -1);
  assert.ok(!tab.hidden.includes(column(tab, key(2)) + 1));
});

test('refresh hides unused preallocated columns and reveals them again without shifting data', () => {
  const h = harness(), e = event('old');
  const f = { id: 'kids', type: 'repeat_group', label: 'Children', maxItems: 10,
    subFields: [{ id: 'age', label: 'Age', type: 'number' }] };
  e.form_schema = [f];
  h.ctx.sheetsResolve({ ...e, form_schema: [{ ...f, exportEntries: 10 }] });
  const tab = tabFor(h, e), key = i => 'detail:' + JSON.stringify(['kids', 'entry', i, 'age']);
  const tenth = column(tab, key(9));
  // Sheets returns actual blank rows; the sparse in-memory fixture needs them materialized.
  for (let i = 0; i < 3; i++) tab.values[i] = [];
  const r = registration(e.id, 'a', { kids: [{ age: '7' }, { age: '8' }] });
  h.ctx.writeEventRows(e, [r], true);
  for (let i = 0; i < 10; i++) assert.equal(tab.hidden.includes(column(tab, key(i)) + 1), i >= 2);
  r.data.kids.push({ age: '0' }); h.ctx.writeEventRows(e, [r], true);
  assert.equal(cell(tab, 'a', key(2)), 0); assert.ok(!tab.hidden.includes(column(tab, key(2)) + 1));
  assert.equal(column(tab, key(9)), tenth);
  r.data.kids = []; h.ctx.writeEventRows(e, [r], true);
  for (let i = 0; i < 10; i++) assert.ok(tab.hidden.includes(column(tab, key(i)) + 1));
});

test('header diagnostics identify the exact tab, cell and duplicate source without writes', () => {
  for (const issue of ['missing', 'json', 'duplicate']) {
    const h = harness(), e = event('diag'); h.send(e, registration(e.id, 'r1'));
    const tab = tabFor(h, e);
    tab.notes[3][4] = issue === 'missing' ? '' : issue === 'json' ? 'headstart:{broken' : tab.notes[3][3];
    const before = plain([tab.values, tab.notes]);
    assert.throws(() => h.ctx.sheetsDiscover(tab), error => {
      assert.ok(error.message.includes('tab "' + tab.name + '"'));
      assert.ok(error.message.includes('gid=' + tab.id));
      assert.ok(error.message.includes('cell E4'));
      assert.ok(error.message.includes(issue === 'duplicate' ? 'also found at D4' : issue === 'json' ? 'invalid JSON' : 'missing note'));
      return true;
    });
    assert.deepEqual(plain([tab.values, tab.notes]), before);
    const html = h.ctx.sheetRefreshPage({});
    assert.ok(html.includes('Sheets version: 2026-10-26-custom-columns'));
  }
});


test('staff checkbox, status, note and formula columns survive refresh and new questions', () => {
  const h = harness(), e = event('custom');
  const r = registration(e.id, 'r1', { q1: 'Before' }); h.send(e, r);
  const tab = tabFor(h, e), width = h.ctx.sheetsDiscover(tab).columns.length;
  tab.values[3].push('Shirt collected', 'Status', 'Note', 'Formula');
  tab.values[4].push(true, 'Ready', 'Blue shirt', '=1+1');
  tab.notes[3][width + 2] = 'Staff instructions';
  tab.formulas[4][width + 3] = '=1+1'; tab.formats[4][width] = 'checkbox-format';
  const customRules = tab.rules; tab.filter.remove(); tab.getRange(4, 1, tab.rows - 3, width + 4).createFilter(); tab.filter.setColumnFilterCriteria(width + 2, { hiddenValues: ['Done'] });
  r.data.q1 = 'After'; h.ctx.writeEventRows(e, [r], true);
  assert.equal(cell(tab, 'r1', 'answer:q1'), 'After');
  assert.deepEqual(tab.values[4].slice(width), [true, 'Ready', 'Blue shirt', '=1+1']);
  assert.equal(tab.rules, customRules);
  assert.equal(tab.filter.getColumnFilterCriteria(width + 2).hiddenValues[0], 'Done');
  e.form_schema.push({ id: 'q2', type: 'long_text', label: 'New question' }); r.data.q2 = 'New answer';
  h.ctx.writeEventRows(e, [r], true);
  assert.equal(cell(tab, 'r1', 'answer:q2'), 'New answer');
  assert.deepEqual(tab.values[4].slice(width + 1), [true, 'Ready', 'Blue shirt', '=1+1']);
  assert.equal(tab.formulas[4][width + 4], '=1+1');
  assert.equal(tab.formats[4][width + 1], 'checkbox-format');
  assert.equal(tab.notes[3][width + 3], 'Staff instructions');
  tab.values[9] = []; tab.values[9][width + 1] = false;
  h.send(e, registration(e.id, 'r2', { q1: 'Second' }));
  assert.equal(tab.values[5][0], 'r2');
  assert.equal(tab.values[9][width + 1], false);
  assert.deepEqual(tab.values[4].slice(width + 1), [true, 'Ready', 'Blue shirt', '=1+1']);
});

test('a manual column inserted inside the managed block still stops without writing', () => {
  const h = harness(), e = event('custom'); h.send(e, registration(e.id, 'r1'));
  const tab = tabFor(h, e); tab.insertColumnsBefore(5, 1); tab.values[3][4] = 'Staff note';
  const before = plain([tab.values, tab.notes]);
  assert.throws(() => h.ctx.writeEventRows(e, [], true), /cell E4: missing note/);
  assert.deepEqual(plain([tab.values, tab.notes]), before);
});
