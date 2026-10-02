/**
 * One spreadsheet per event. Runs ONLY after a registration or an admin refresh.
 * Add alongside EmailRelay.gs. No scheduled scans or background database polling.
 */
var SHEETS_OWNER_KEY = 'headstart_event';
var SHEETS_BATCH_SIZE = 100;

function sheetsDestination(value) {
  var match = String(value || '').trim().match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]+)(?:\/[^?#\s]*)?(?:[?#]\S*)?$/);
  return match && match[1] !== 'e' ? match[1] : null;
}

/** Run once when upgrading: remove only triggers from the former sheet scanner. */
function installGoogleSheetsSync() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'syncGoogleSheets') ScriptApp.deleteTrigger(trigger);
  });
  return { mode: 'registration-or-admin-refresh', scheduledScans: false };
}

/** A stale installed trigger must not query the database after upgrading. */
function syncGoogleSheets() { return { skipped: 'Scheduled syncing is disabled. Use Refresh Google Sheet.' }; }

/** Reuses the registration and event already fetched by the email relay. */
function syncRegistrationToSheet(reg) {
  var event = reg.events;
  if (!event || !event.settings || !event.settings.googleSheetUrl) return { added: 0, updated: 0 };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error('Sheet is busy. An admin can refresh to recover this row.');
  try { return writeEventRows(event, [reg], false); }
  finally { lock.releaseLock(); }
}

/** Owner/staff role is read from verified, server-controlled app_metadata. */
function verifySheetAdmin(token) {
  if (typeof token !== 'string' || !token) throw new Error('Sign in to the app before refreshing.');
  var res = UrlFetchApp.fetch(SUPABASE_URL + '/auth/v1/user', {
    headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + token }, muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error('Your session expired. Sign in again and retry.');
  var user = JSON.parse(res.getContentText());
  var role = user.app_metadata && user.app_metadata.role;
  if (!user.id || user.is_anonymous || ['owner', 'staff'].indexOf(role) === -1) throw new Error('Only a school owner or staff account can refresh a sheet.');
}

/** One explicit refresh walks only this event, never all events. */
function refreshEventSheet(payload) {
  verifySheetAdmin(payload.accessToken);
  if (!/^[a-f0-9-]{36}$/i.test(String(payload.eventId || ''))) throw new Error('Invalid event.');
  var events = supabaseGet('/rest/v1/events?select=id,name,settings,form_schema&id=eq.' + encodeURIComponent(payload.eventId));
  var event = events[0];
  if (!event || !sheetsDestination(event.settings && event.settings.googleSheetUrl)) throw new Error('Save a Google Sheet link in this event’s settings first.');
  var cursor = /^[a-f0-9-]{36}$/i.test(String(payload.cursor || '')) ? payload.cursor : '';
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error('Another sync is running. Please try Refresh again.');
  var added = 0, updated = 0, complete = false;
  try {
    var deadline = Date.now() + 200000;
    for (var page = 0; page < 20 && Date.now() < deadline; page++) {
      var path = '/rest/v1/registrations?select=id,event_id,reference,name,email,phone,status,created_at,data,booths!registrations_booth_id_fkey(label,number),registration_booths(booths(label,number))' +
        '&event_id=eq.' + encodeURIComponent(event.id) + '&order=id.asc&limit=' + SHEETS_BATCH_SIZE + (cursor ? '&id=gt.' + encodeURIComponent(cursor) : '');
      var rows = supabaseGet(path);
      var result = writeEventRows(event, rows, true);
      added += result.added; updated += result.updated;
      if (!rows.length) { complete = true; break; }
      cursor = rows[rows.length - 1].id;
    }
    return { added: added, updated: updated, complete: complete, cursor: cursor, url: event.settings.googleSheetUrl };
  } finally { lock.releaseLock(); }
}

/** Returns a visible completion page because Apps Script responses do not offer browser CORS. */
function sheetRefreshPage(payload) {
  var escape = function (s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); };
  var body;
  try {
    var result = refreshEventSheet(payload);
    body = '<h1>' + (result.complete ? 'Google Sheet refreshed' : 'Refresh in progress') + '</h1><p>' + result.added + ' rows added; ' + result.updated + ' rows updated in this batch.</p>';
    if (!result.complete) {
      var next = JSON.stringify({ action: 'google_sheet_refresh', eventId: payload.eventId, accessToken: payload.accessToken, cursor: result.cursor });
      body += '<p>This event needs another batch. Nothing runs in the background.</p><form method="post" target="_top" action="' + escape(ScriptApp.getService().getUrl()) + '"><input type="hidden" name="request" value="' + escape(next) + '"><button type="submit">Continue refresh</button></form>';
    }
    body += '<p><a target="_blank" rel="noopener noreferrer" href="https://docs.google.com/spreadsheets/d/' + sheetsDestination(result.url) + '/edit">Open Google Sheet</a></p>';
  } catch (err) { body = '<h1>Sheet refresh failed</h1><p>' + escape(String(err)) + '</p><p>Return to the app and try again after correcting the problem. Saved registrations are retained.</p>'; }
  return HtmlService.createHtmlOutput('<!doctype html><html><head><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="font:16px Arial,sans-serif;max-width:640px;margin:48px auto;padding:24px;color:#1a3c5e">' + body + '</body></html>');
}

/** Called with a lock held. Destination is always taken from the saved event. */
function writeEventRows(event, rows, updateExisting) {
  var spreadsheetId = sheetsDestination(event.settings.googleSheetUrl);
  if (!spreadsheetId) throw new Error('Invalid Google Sheet link.');
  if (rows.some(function (r) { return r.event_id !== event.id; })) throw new Error('Registration event mismatch.');
  var book = SpreadsheetApp.openById(spreadsheetId);
  var owner = SUPABASE_URL + '#' + event.id;
  var metadata = book.getDeveloperMetadata().filter(function (m) { return m.getKey() === SHEETS_OWNER_KEY; });
  if (metadata.some(function (m) { return m.getValue() !== owner; })) throw new Error('This spreadsheet belongs to another event. Use a separate blank spreadsheet.');
  var sheet = book.getSheetByName('Registrations');
  if (!metadata.length) {
    if (sheet && sheet.getLastRow()) throw new Error('The Registrations tab already contains data. Use a blank spreadsheet.');
    book.addDeveloperMetadata(SHEETS_OWNER_KEY, owner, SpreadsheetApp.DeveloperMetadataVisibility.DOCUMENT);
  }
  if (!sheet) sheet = book.insertSheet('Registrations');
  var columns = sheetsColumns(sheet, event);
  var lastRow = sheet.getLastRow(), seen = Object.create(null), added = [], updated = 0;
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, 1).getValues().forEach(function (r, i) { seen[String(r[0])] = i + 2; });
  rows.forEach(function (reg) {
    if (!reg.id) throw new Error('Registration ID missing.');
    var values = columns.map(function (column) { return sheetsText(sheetsValue(column, event, reg)); });
    if (seen[reg.id]) {
      if (updateExisting) { sheet.getRange(seen[reg.id], 1, 1, columns.length).setNumberFormat('@').setValues([values]); updated++; }
    } else {
      added.push(values); seen[reg.id] = lastRow + added.length;
    }
  });
  if (added.length) {
    sheetsEnsureSize(sheet, lastRow + added.length, columns.length);
    sheet.getRange(lastRow + 1, 1, added.length, columns.length).setNumberFormat('@').setValues(added);
  }
  // Appearance never blocks the export: the rows above are already written.
  try { styleRegistrationsSheet(sheet, columns, Math.max(sheet.getLastRow(), 1)); }
  catch (styleError) { console.warn('Sheet styling skipped: ' + styleError); }
  SpreadsheetApp.flush();
  return { added: added.length, updated: updated };
}

// HeadStart branding: navy header with a gold rule, soft navy row banding,
// and status colours that match the app. Safe to repeat after every write.
var SHEETS_STYLE = {
  navy: '#1a3c5e', gold: '#f0b323', white: '#ffffff', band: '#eef3f8', text: '#14202e',
  status: {
    confirmed: ['#dcfce7', '#166534'],
    pending: ['#fdf7e7', '#8f5e0c'], waitlist: ['#d5e0ec', '#1a3c5e'],
    rejected: ['#fee2e2', '#991b1b'], cancelled: ['#f1f5f9', '#64748b'],
  },
};
var SHEETS_WIDTHS = { reference: 110, created_at: 170, event: 200, name: 190, email: 230, phone: 130, booth: 130, status: 110 };

function styleRegistrationsSheet(sheet, columns, rows) {
  var width = columns.length, s = SHEETS_STYLE;
  sheet.setTabColor(s.navy);
  sheet.setFrozenRows(1);
  sheet.setHiddenGridlines(true);

  sheet.setRowHeight(1, 40);
  sheet.getRange(1, 1, 1, width)
    .setBackground(s.navy).setFontColor(s.white).setFontFamily('Arial').setFontSize(11).setFontWeight('bold')
    .setVerticalAlignment('middle').setHorizontalAlignment('left').setWrap(true)
    .setBorder(null, null, true, null, null, null, s.gold, SpreadsheetApp.BorderStyle.SOLID_THICK);

  if (rows > 1) {
    sheet.getRange(2, 1, rows - 1, width)
      .setFontFamily('Arial').setFontSize(10).setFontColor(s.text).setVerticalAlignment('top')
      .setBorder(null, null, null, null, null, true, '#d5e0ec', SpreadsheetApp.BorderStyle.SOLID);
  }

  // Alternate row shading over the whole table, grown as rows arrive.
  var table = sheet.getRange(1, 1, rows, width);
  var banding = sheet.getBandings()[0];
  if (banding) banding.setRange(table);
  else banding = table.applyRowBanding(SpreadsheetApp.BandingTheme.BLUE, true, false);
  banding.setHeaderRowColor(s.navy).setFirstRowColor(s.white).setSecondRowColor(s.band);

  // A filter row lets staff sort and filter by status, booth or any answer.
  var filter = sheet.getFilter();
  if (filter && filter.getRange().getA1Notation() !== table.getA1Notation()) { filter.remove(); filter = null; }
  if (!filter) table.createFilter();

  columns.forEach(function (column, i) {
    var col = i + 1;
    if (column.key === 'id') sheet.setColumnWidth(col, 90);
    else sheet.setColumnWidth(col, SHEETS_WIDTHS[column.key] || 240);
    if (rows > 1 && column.key.indexOf('answer:') === 0) sheet.getRange(2, col, rows - 1, 1).setWrap(true);
  });
  // The internal ID is kept (it prevents duplicates) but tucked out of the way.
  sheet.hideColumns(1);

  var statusIndex = columns.map(function (c) { return c.key; }).indexOf('status');
  if (statusIndex >= 0 && rows > 1) {
    var statusRange = sheet.getRange(2, statusIndex + 1, rows - 1, 1).setHorizontalAlignment('center').setFontWeight('bold');
    sheet.setConditionalFormatRules(Object.keys(s.status).map(function (name) {
      return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(name)
        .setBackground(s.status[name][0]).setFontColor(s.status[name][1]).setRanges([statusRange]).build();
    }));
  }
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
    { key: 'phone', label: 'Phone' }, { key: 'booth', label: 'Booth' }, { key: 'status', label: 'Status' },
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
  if (typeof value === 'string' && /^data:image\//i.test(value)) return 'Signature captured (view in app)';
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
