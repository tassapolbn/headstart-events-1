/**
 * Per-event Google Sheets export. Add this file alongside EmailRelay.gs.
 * Uses its server-side Supabase credentials; never receives a destination
 * from the public registration form. See GOOGLE_SHEETS_SETUP.md.
 *
 * This is an append-only export, not a two-way editor. A recurring complete
 * sweep repairs missed rows without relying on email delivery or a browser.
 */
var SHEETS_OWNER_KEY = 'headstart_event';
var SHEETS_EVENT_CURSOR = 'sheets_event_cursor';
var SHEETS_BATCH_SIZE = 100;

function sheetsDestination(value) {
  var match = String(value || '').trim().match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]+)(?:\/[^?#\s]*)?(?:[?#]\S*)?$/);
  return match && match[1] !== 'e' ? match[1] : null;
}

/** Run once in the Apps Script editor using the school account. */
function installGoogleSheetsSync() {
  var exists = ScriptApp.getProjectTriggers().some(function (trigger) {
    return trigger.getHandlerFunction() === 'syncGoogleSheets';
  });
  if (!exists) ScriptApp.newTrigger('syncGoogleSheets').timeBased().everyMinutes(5).create();
  return syncGoogleSheets();
}

function syncGoogleSheets() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return { skipped: 'already running' };
  var errors = [];
  var added = 0;
  try {
    // Ten events per run, rotating by UUID. Progress is saved per event, so
    // one large event or a broken spreadsheet cannot starve the others.
    var cursor = PROPS.getProperty(SHEETS_EVENT_CURSOR) || '';
    var path = '/rest/v1/events?select=id,name,settings,form_schema&settings->>googleSheetUrl=not.is.null&order=id.asc&limit=10';
    var events = supabaseGet(path + (cursor ? '&id=gt.' + encodeURIComponent(cursor) : ''));
    if (!events.length && cursor) events = supabaseGet(path);
    var deadline = Date.now() + 240000;
    for (var i = 0; i < events.length && Date.now() < deadline; i++) {
      var event = events[i];
      try {
        var url = event.settings && event.settings.googleSheetUrl;
        if (url && String(url).trim()) added += syncEventSheet(event);
      } catch (err) {
        errors.push(event.id);
        console.error('Google Sheets sync failed for event ' + event.id + ': ' + String(err));
      }
      PROPS.setProperty(SHEETS_EVENT_CURSOR, event.id);
    }
    if (!events.length) PROPS.deleteProperty(SHEETS_EVENT_CURSOR);
    // Mark failed trigger executions as failures, so Apps Script can notify
    // its owner. Successful events still make progress and failed ones retry.
    if (errors.length) throw new Error('Google Sheets sync failed for event(s): ' + errors.join(', ') + '. Check the execution log.');
    return { added: added };
  } finally {
    lock.releaseLock();
  }
}

/** Called only while holding the script lock. */
function syncEventSheet(event) {
  var spreadsheetId = sheetsDestination(event.settings.googleSheetUrl);
  if (!spreadsheetId) throw new Error('Invalid Google Sheet link.');
  var book = SpreadsheetApp.openById(spreadsheetId);
  var owner = SUPABASE_URL + '#' + event.id;
  var metadata = book.getDeveloperMetadata().filter(function (m) { return m.getKey() === SHEETS_OWNER_KEY; });
  if (metadata.some(function (m) { return m.getValue() !== owner; })) {
    throw new Error('This spreadsheet belongs to another event. Use a separate blank spreadsheet.');
  }
  var sheet = book.getSheetByName('Registrations');
  if (!metadata.length) {
    if (sheet && sheet.getLastRow()) throw new Error('The Registrations tab already contains data. Use a blank spreadsheet.');
    book.addDeveloperMetadata(SHEETS_OWNER_KEY, owner, SpreadsheetApp.DeveloperMetadataVisibility.DOCUMENT);
  }
  if (!sheet) sheet = book.insertSheet('Registrations');
  var columns = sheetsColumns(sheet, event);

  // The destination is part of the saved progress. Changing the link starts
  // a fresh import; returning to an old file is safe because IDs are checked.
  var key = 'sheets_rows_' + event.id;
  var saved = PROPS.getProperty(key);
  var progress = saved ? JSON.parse(saved) : {};
  var cursor = progress.destination === spreadsheetId ? progress.cursor : '';
  var path = '/rest/v1/registrations?select=id,event_id,reference,name,email,phone,status,created_at,data,booths!registrations_booth_id_fkey(label,number),registration_booths(booths(label,number))' +
    '&event_id=eq.' + encodeURIComponent(event.id) + '&order=id.asc&limit=' + SHEETS_BATCH_SIZE;
  var rows = supabaseGet(path + (cursor ? '&id=gt.' + encodeURIComponent(cursor) : ''));
  // Start the next sweep once the cursor reaches the end. Do not infer the
  // end from page length: a server can impose a smaller result limit.
  if (!rows.length && cursor) rows = supabaseGet(path);
  if (rows.some(function (r) { return r.event_id !== event.id; })) throw new Error('Registration event mismatch.');

  var lastRow = sheet.getLastRow();
  var seen = Object.create(null);
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, 1).getValues().forEach(function (r) { seen[String(r[0])] = true; });
  var values = [];
  rows.forEach(function (reg) {
    if (!reg.id) throw new Error('Registration ID missing.');
    if (seen[reg.id]) return;
    seen[reg.id] = true;
    values.push(columns.map(function (column) { return sheetsText(sheetsValue(column, event, reg)); }));
  });
  if (values.length) {
    sheetsEnsureSize(sheet, lastRow + values.length, columns.length);
    sheet.getRange(lastRow + 1, 1, values.length, columns.length).setNumberFormat('@').setValues(values);
  }
  // Flush before advancing. If a write succeeds but the checkpoint fails,
  // the next run reads the IDs from the sheet and skips the committed rows.
  SpreadsheetApp.flush();
  PROPS.setProperty(key, JSON.stringify({ destination: spreadsheetId, cursor: rows.length ? rows[rows.length - 1].id : '' }));
  return values.length;
}

function sheetsEnsureSize(sheet, rows, columns) {
  if (rows > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), rows - sheet.getMaxRows());
  if (columns > sheet.getMaxColumns()) sheet.insertColumnsAfter(sheet.getMaxColumns(), columns - sheet.getMaxColumns());
}

function sheetsColumns(sheet, event) {
  var base = [
    { key: 'id', label: 'Registration ID' }, { key: 'reference', label: 'Reference' },
    { key: 'created_at', label: 'Submitted (UTC)' }, { key: 'event', label: 'Event' },
    { key: 'name', label: 'Name' }, { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' }, { key: 'booth', label: 'Booth' }, { key: 'status', label: 'Status at export' },
  ];
  var questions = (event.form_schema || []).filter(function (f) {
    return ['heading', 'rich_text', 'divider'].indexOf(f.type) === -1;
  }).map(function (f) { return { key: 'answer:' + f.id, label: f.label, type: f.type }; });
  var columns = [];
  if (sheet.getLastRow()) {
    // Column notes contain stable field IDs. Reordering/renaming form
    // questions cannot shift later answers under an unrelated old heading.
    var width = sheet.getLastColumn();
    var notes = sheet.getRange(1, 1, 1, width).getNotes()[0];
    columns = notes.map(function (note) {
      if (note.indexOf('headstart:') !== 0) throw new Error('Managed column notes were changed. Restore the header notes or connect a blank spreadsheet.');
      return JSON.parse(note.slice(10));
    });
    if (!columns[0] || columns[0].key !== 'id') throw new Error('Registration ID must remain the first column.');
    var keys = columns.map(function (c) { return c.key; });
    if (new Set(keys).size !== keys.length || base.some(function (c) { return keys.indexOf(c.key) === -1; })) {
      throw new Error('Managed columns were removed or duplicated. Restore them or connect a blank spreadsheet.');
    }
  }
  var added = base.concat(questions).filter(function (column) {
    return !columns.some(function (existing) { return existing.key === column.key; });
  });
  if (added.length) {
    sheetsEnsureSize(sheet, 1, columns.length + added.length);
    var range = sheet.getRange(1, columns.length + 1, 1, added.length);
    // Write notes first so retrying a partially written header can recover.
    range.setNotes([added.map(function (c) { return 'headstart:' + JSON.stringify(c); })]);
    range.setNumberFormat('@').setValues([added.map(function (c) { return sheetsText(c.label); })]);
    sheet.setFrozenRows(1);
  }
  return columns.concat(added);
}

function sheetsValue(column, event, reg) {
  if (column.key === 'event') return event.name;
  if (column.key === 'booth') {
    var booths = reg.registration_booths && reg.registration_booths.length
      ? reg.registration_booths.map(function (r) { return r.booths; }) : [reg.booths];
    return booths.filter(Boolean).map(function (b) { return [b.label, b.number].filter(function (v) { return v !== null && v !== undefined && v !== ''; }).join(' '); }).join(' + ');
  }
  if (column.key.indexOf('answer:') !== 0) return reg[column.key];
  var value = (reg.data || {})[column.key.slice(7)];
  if (column.type === 'signature') return value ? 'Signature captured (view in app)' : '';
  if (value && typeof value === 'object' && 'bucket' in value && 'path' in value) return value.name || 'File (view in app)';
  if (Array.isArray(value)) return value.map(function (v) { return typeof v === 'object' ? JSON.stringify(v) : String(v); }).join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return value;
}

function sheetsText(value) {
  var text = value === null || value === undefined ? '' : String(value);
  // Sheets cells are limited to 50,000 characters. The complete answer stays
  // in the app; explicitly mark long exported values instead of failing a batch.
  if (text.length > 49000) text = text.slice(0, 49000) + ' [truncated; view full answer in app]';
  // Treat participant answers and question labels as literal text, including
  // spreadsheet formulas, phone prefixes and leading zeroes.
  return /^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text) ? "'" + text : text;
}
