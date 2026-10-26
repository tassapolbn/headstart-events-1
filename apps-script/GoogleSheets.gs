// Event tabs are updated only by registrations and explicit admin refreshes.
var SHEETS_OWNER_KEY = 'headstart_event';
var SHEETS_BATCH_SIZE = 100;
var SHEETS_FORMAT_VERSION = '2026-10-26-detail-columns';

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

var SHEETS_CONTACT_KEYS = ['name', 'email', 'phone'];
var SHEETS_CONTACT_LABELS = { name: 'Name', email: 'Email', phone: 'Phone' };
var SHEETS_CONTACT_WORDS = { name: /name|ชื่อ/i, email: /e-?mail|อีเมล/i, phone: /phone|mobile|\btel\b|โทร|เบอร์|มือถือ/i };

function sheetsQuestions(fields) {
  return (fields || []).filter(function (f) {
    return f && f.id && ['heading', 'rich_text', 'callout', 'image', 'divider', 'page_break'].indexOf(f.type) === -1;
  });
}

function sheetsContactSources(fields) {
  var questions = sheetsQuestions(fields), sources = { name: null, email: null, phone: null };
  var mapped = function (key) { return questions.filter(function (f) { return f.mapTo === key; }); };
  var available = function (f) {
    return !f.mapTo && !SHEETS_CONTACT_KEYS.some(function (k) { return sources[k] && sources[k].id === f.id; });
  };
  SHEETS_CONTACT_KEYS.forEach(function (key) {
    var candidates = mapped(key);
    if (candidates.length === 1) sources[key] = candidates[0];
  });
  if (!mapped('name').length) {
    var firstName = questions.filter(function (f) { return f.type === 'short_text'; })[0];
    if (firstName && available(firstName)) sources.name = firstName;
  }
  if (!mapped('email').length) {
    var firstEmail = questions.filter(function (f) { return f.type === 'email'; })[0];
    if (firstEmail) {
      if (available(firstEmail)) sources.email = firstEmail;
    } else {
      var emails = questions.filter(function (f) { return available(f) && f.type === 'short_text' && SHEETS_CONTACT_WORDS.email.test(f.label || ''); });
      if (emails.length === 1) sources.email = emails[0];
    }
  }
  if (!mapped('phone').length) {
    var phones = questions.filter(function (f) {
      return available(f) && (f.type === 'phone' || (f.type === 'short_text' && SHEETS_CONTACT_WORDS.phone.test(f.label || '')));
    });
    if (phones.length === 1) sources.phone = phones[0];
  }
  return sources;
}

function sheetsContactLabel(key, source) {
  var label = String(source && source.label || '').replace(/\s+/g, ' ').trim();
  return !label ? SHEETS_CONTACT_LABELS[key] : SHEETS_CONTACT_WORDS[key].test(label) ? label : SHEETS_CONTACT_LABELS[key] + ' — ' + label;
}

function sheetsCanTotal(field) { return (field.type === 'number' && !field.collectNames) || field.type === 'slider'; }

function sheetsTabName(settings, eventName) {
  var clean = function (v) { return Array.from(String(v || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 100).join('').trim(); };
  return clean(settings && settings.googleSheetTab) || clean(eventName) || 'Event';
}

// Stable keys use field/subfield IDs and entry positions, never editable labels.
function sheetsDetailColumns(f) {
  var parent = 'answer:' + f.id;
  function detail(parts, label, kind) {
    return { key: 'detail:' + JSON.stringify([f.id].concat(parts)), parent: parent,
      label: String(f.label || '') + ' — ' + label, kind: kind || 'text', parts: parts, fieldId: f.id };
  }
  if (f.type === 'repeat_group') {
    var fallback = f.countMode === 'number' ? 10 : 6;
    var max = Math.max(1, Math.min(50, Math.floor(f.maxItems == null ? fallback : f.maxItems) || fallback));
    var columns = [detail(['count'], 'Count', 'number')];
    for (var i = 0; i < max; i++) (f.subFields || []).forEach(function (sub) {
      columns.push(detail(['entry', i, sub.id], (String(f.itemLabel || '').trim() || 'Entry') + ' ' + (i + 1) + ' — ' + sub.label, sub.type === 'number' ? 'number' : 'text'));
    });
    return columns;
  }
  if (['grid', 'checkbox_grid', 'ranking'].indexOf(f.type) !== -1) {
    return (f.type === 'ranking' ? f.options || [] : f.rows || []).map(function (row) {
      return detail(['row', row], row);
    });
  }
  return [];
}

function sheetsPlan(event) {
  var settings = event.settings || {}, sources = sheetsContactSources(event.form_schema);
  var exclude = settings.googleSheetExclude || [], totals = settings.googleSheetTotals || [];
  var columns = [
    { key: 'id', label: 'Registration ID' }, { key: 'reference', label: 'Reference' },
    { key: 'created_at', label: 'Submitted (UTC)' }, { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' },
    { key: 'booth', label: 'Booth', kind: 'number' },
    { key: 'vendor_type', label: 'Type of vendor' }, { key: 'status', label: 'Status' }
  ];
  var merged = Object.create(null);
  SHEETS_CONTACT_KEYS.forEach(function (key) { if (sources[key]) merged['answer:' + sources[key].id] = key; });
  columns = columns.concat(sheetsQuestions(event.form_schema).flatMap(function (f) {
    var total = sheetsCanTotal(f) && totals.indexOf(f.id) !== -1;
    var details = sheetsDetailColumns(f);
    return [{ key: 'answer:' + f.id, label: String(f.label || ''), kind: total ? 'number' : 'text', total: total, legacyDetails: details.length > 0 }].concat(details);
  }));
  columns.forEach(function (c) {
    var contact = sources[c.key] ? c.key : merged[c.key];
    c.excluded = c.key !== 'id' && (exclude.indexOf(c.key) !== -1 || (c.parent && exclude.indexOf(c.parent) !== -1) || !!(contact &&
      (exclude.indexOf(contact) !== -1 || exclude.indexOf('answer:' + sources[contact].id) !== -1)));
    if (sources[c.key]) { c.source = sources[c.key]; c.label = sheetsContactLabel(c.key, c.source); }
    c.merged = merged[c.key];
  });
  if (!columns.some(function (c) { return c.key !== 'id' && !c.excluded && !c.merged; })) columns[1].excluded = false;
  return { columns: columns.filter(function (c) { return !c.merged; }), all: columns, sources: sources, exclude: exclude };
}

function sheetsMetadata(tab, key) {
  return tab.getDeveloperMetadata().filter(function (m) { return m.getKey() === key; });
}

function sheetsMetaGet(tab, key) {
  var found = sheetsMetadata(tab, key);
  return found.length ? found[0].getValue() : '';
}

function sheetsMetaSet(tab, key, value) {
  var found = sheetsMetadata(tab, key);
  if (value === null) { found.forEach(function (m) { m.remove(); }); return; }
  if (found.length) {
    found[0].setValue(String(value));
    found.slice(1).forEach(function (m) { m.remove(); });
  } else tab.addDeveloperMetadata(key, String(value), SpreadsheetApp.DeveloperMetadataVisibility.DOCUMENT);
}

function sheetsBlank(tab) { return tab.getLastRow() === 0 && tab.getLastColumn() === 0; }

function sheetsFreeName(book, wanted, tab) {
  var names = book.getSheets().filter(function (s) { return !tab || s.getSheetId() !== tab.getSheetId(); }).map(function (s) { return s.getName().toLowerCase(); });
  var name = wanted, n = 2;
  while (names.indexOf(name.toLowerCase()) !== -1) {
    var suffix = ' (' + n++ + ')';
    name = Array.from(wanted).slice(0, 100 - suffix.length).join('') + suffix;
  }
  return name;
}

function sheetsNamedAction(book, event, tab) {
  var wanted = sheetsTabName(event.settings, event.name);
  var names = [wanted, wanted.replace(/[\[\]*?:/\\]/g, '-'), 'Event ' + String(event.id).slice(0, 8)], lastError;
  for (var i = 0; i < names.length; i++) {
    try {
      var name = sheetsFreeName(book, names[i], tab);
      return tab ? tab.setName(name) : book.insertSheet(name, book.getSheets().length);
    } catch (err) { lastError = err; }
  }
  throw lastError;
}

function sheetsRecoveryName(name, wanted) {
  var suffix = name.match(/ \((?:[2-9]|[1-9][0-9]+)\)$/);
  var base = suffix ? Array.from(wanted).slice(0, 100 - suffix[0].length).join('') : wanted;
  var escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return name.toLowerCase() === wanted.toLowerCase() || !!(suffix && new RegExp('^' + escaped + ' \\([0-9]+\\)$', 'i').test(name));
}

function sheetsEventTab(book, event) {
  var owner = SUPABASE_URL + '#' + event.id;
  var own = book.createDeveloperMetadataFinder().withKey(SHEETS_OWNER_KEY).withValue(owner).find()
    .filter(function (m) { return String(m.getLocation().getLocationType()) === 'SHEET'; });
  if (own.length > 1) throw new Error('Multiple event tabs: ' + own.map(function (m) { return m.getLocation().getSheet().getName(); }).join(', ') + '. Delete the copy, then refresh.');
  if (own.length) return own[0].getLocation().getSheet();
  var claims = book.createDeveloperMetadataFinder().withKey(SHEETS_OWNER_KEY).find();
  var legacy = claims.some(function (m) { return m.getValue() === owner && String(m.getLocation().getLocationType()) === 'SPREADSHEET'; });
  var tab = book.getSheetByName('Registrations');
  if (legacy && tab && !sheetsMetadata(tab, SHEETS_OWNER_KEY).length) {
    sheetsDiscover(tab);
    sheetsMetaSet(tab, 'headstart_tab_name', 'Registrations');
    sheetsMetaSet(tab, SHEETS_OWNER_KEY, owner);
    return tab;
  }
  var wanted = sheetsTabName(event.settings, event.name);
  var recoveryNames = [wanted, wanted.replace(/[\[\]*?:/\\]/g, '-'), 'Event ' + String(event.id).slice(0, 8)];
  var tabs = book.getSheets();
  tab = tabs.filter(function (s) {
    var tabName = s.getName();
    return recoveryNames.some(function (name) { return sheetsRecoveryName(tabName, name); }) &&
      !sheetsMetadata(s, SHEETS_OWNER_KEY).length && sheetsBlank(s);
  })[0];
  if (!tab && !claims.length && tabs.length === 1 && sheetsBlank(tabs[0])) tab = tabs[0];
  var inserted = !tab;
  if (inserted) tab = sheetsNamedAction(book, event, null);
  // Remember the request before claiming so a failed claim leaves a recoverable blank tab.
  sheetsMetaSet(tab, 'headstart_tab_name', inserted || tab.getName() === wanted ? wanted : '');
  sheetsMetaSet(tab, SHEETS_OWNER_KEY, owner);
  return tab;
}

function sheetsRename(book, tab, event) {
  var wanted = sheetsTabName(event.settings, event.name);
  if (sheetsMetaGet(tab, 'headstart_tab_name') === wanted) return;
  try {
    sheetsNamedAction(book, event, tab);
    sheetsMetaSet(tab, 'headstart_tab_name', wanted);
  } catch (err) { console.warn('Sheet rename skipped: ' + err); }
}

function sheetsDiscover(tab) {
  var found = [], aNotes = tab.getRange(1, 1, Math.min(20, tab.getMaxRows()), 1).getNotes();
  aNotes.forEach(function (r, i) {
    if (r[0].indexOf('headstart:') !== 0) return;
    try { if (JSON.parse(r[0].slice(10)).key === 'id') found.push(i + 1); } catch (err) { /* Validated below. */ }
  });
  if (found.length > 1) throw new Error('Multiple managed header rows. Restore the header notes.');
  if (!found.length) {
    if (sheetsBlank(tab)) return { headerRow: 4, columns: [], notes: [] };
    throw new Error('Managed header notes are missing. Restore them or connect a blank tab.');
  }
  var row = found[0], notes = tab.getRange(row, 1, 1, tab.getMaxColumns()).getNotes()[0];
  var width = tab.getLastColumn();
  notes.forEach(function (n, i) { if (n) width = Math.max(width, i + 1); });
  var keys = Object.create(null);
  var columns = notes.slice(0, width).map(function (note, i) {
    var c;
    try { if (note.indexOf('headstart:') === 0) c = JSON.parse(note.slice(10)); } catch (err) { c = null; }
    if (!c || typeof c.key !== 'string' || !c.key || (c.label !== undefined && typeof c.label !== 'string') || keys[c.key] || (i === 0 && c.key !== 'id') ||
      (c.flags !== undefined && (!c.flags || typeof c.flags !== 'object' || Array.isArray(c.flags)))) {
      throw new Error('Managed column notes are invalid or duplicated. Restore the header notes.');
    }
    keys[c.key] = true;
    return { key: c.key, label: c.label || '', flags: c.flags || {} };
  });
  return { headerRow: row, columns: columns, notes: notes.slice(0, width) };
}

function sheetsEnsureSize(tab, rows, columns) {
  if (rows >= tab.getMaxRows()) tab.insertRowsAfter(tab.getMaxRows(), Math.max(100, rows + 1 - tab.getMaxRows()));
  if (columns > tab.getMaxColumns()) tab.insertColumnsAfter(tab.getMaxColumns(), columns - tab.getMaxColumns());
}

function sheetsRefreshNeeded(tab) { sheetsMetaSet(tab, 'headstart_refresh_needed', new Date().toISOString()); }

function sheetsSaveNotes(tab, layout) {
  var notes = layout.columns.map(function (c) { return 'headstart:' + JSON.stringify({ key: c.key, label: c.label, flags: c.flags }); });
  if (JSON.stringify(notes) !== JSON.stringify(layout.notes)) {
    tab.getRange(layout.headerRow, 1, 1, notes.length).setNotes([notes]);
    layout.notes = notes;
  }
}

function sheetsLayout(tab, event, plan) {
  var layout = sheetsDiscover(tab), header = layout.headerRow, columns = layout.columns;
  if (header < 4) { tab.insertRowsBefore(header, 4 - header); header = 4; }
  var hasRows = tab.getLastRow() > header;
  var added = plan.columns.filter(function (c) { return !columns.some(function (old) { return old.key === c.key; }); });
  if (hasRows && added.some(function (c) { return !c.excluded; })) sheetsRefreshNeeded(tab);
  sheetsEnsureSize(tab, header + 1, columns.length + added.length);
  added.forEach(function (c) { columns.push({ key: c.key, label: c.label, flags: {} }); });
  // Persist appended notes together, before labels, so partial header writes can recover.
  if (added.length) tab.getRange(header, columns.length - added.length + 1, 1, added.length).setNotes([
    columns.slice(-added.length).map(function (c) { return 'headstart:' + JSON.stringify(c); })
  ]);
  columns.forEach(function (c) {
    var target = plan.all.filter(function (p) { return p.key === c.key; })[0];
    var merged = c.key.indexOf('answer:') === 0 && SHEETS_CONTACT_KEYS.indexOf(c.flags.merged) !== -1 ? c.flags.merged : undefined;
    var contact = merged && plan.all.filter(function (p) { return p.key === merged; })[0];
    c.target = target || { key: c.key, label: c.label, merged: merged,
      excluded: c.key !== 'id' && (plan.exclude.indexOf(c.key) !== -1 || (c.key.indexOf('detail:') === 0 && plan.exclude.indexOf('answer:' + JSON.parse(c.key.slice(7))[0]) !== -1) || !!(contact && contact.excluded)) };
    c.label = c.target.label;
  });
  var count = Math.max(0, tab.getLastRow() - header);
  columns.forEach(function (c, i) {
    var target = c.target, flags = c.flags;
    var hidden = c.key === 'id' || c.key === 'event' || !!target.merged || !!target.legacyDetails;
    var decimals = flags.decimals;
    var data = count ? tab.getRange(header + 1, i + 1, count, 1) : null;
    if (target.excluded) {
      if (!flags.excluded) { if (data) data.clearContent(); tab.hideColumns(i + 1); }
      c.flags = { excluded: true, hidden: true };
      if (target.merged) c.flags.merged = target.merged;
    } else {
      if (flags.excluded) {
        if (hasRows) sheetsRefreshNeeded(tab);
        if (!hidden) tab.showColumns(i + 1);
      }
      if (target.merged && flags.merged !== target.merged && data) {
        var to = columns.map(function (col) { return col.key; }).indexOf(target.merged);
        var contact = tab.getRange(header + 1, to + 1, count, 1), base = contact.getValues(), answers = data.getValues();
        var folded = base.map(function (r, n) { return [sheetsText(sheetsMerge(target.merged, r[0], answers[n][0]))]; });
        contact.setNumberFormat('@').setValues(folded);
      }
      // Older numeric notes need this scan once to initialise the precision flag.
      if (target.total && (!flags.num || typeof decimals !== 'boolean')) {
        var cells = data ? data.getValues().map(function (r) { return sheetsCell(r[0], true); }) : [];
        decimals = decimals === true || cells.some(function (cell) { return typeof cell.value === 'number' && !Number.isInteger(cell.value); });
        if (data) data.setNumberFormats(cells.map(function (c) { return [c.format]; })).setValues(cells.map(function (c) { return [c.value]; }));
      }
      if (hidden && (!flags.hidden || flags.excluded)) tab.hideColumns(i + 1);
      if (!hidden && flags.hidden) {
        tab.showColumns(i + 1);
      }
      c.flags = {};
      if (hidden) c.flags.hidden = true;
      if (target.merged) c.flags.merged = target.merged;
      if (target.total) c.flags.num = true;
    }
    if (typeof decimals === 'boolean') c.flags.decimals = decimals;
  });
  var reconciled = { headerRow: header, columns: columns, notes: layout.notes };
  sheetsSaveNotes(tab, reconciled);
  tab.getRange(header, 1, 1, columns.length).setNumberFormat('@').setValues([columns.map(function (c) { return sheetsText(c.label); })]);
  return reconciled;
}

function sheetsMerge(key, base, answer) {
  base = base === null || base === undefined ? '' : String(base);
  answer = answer === null || answer === undefined ? '' : String(answer);
  if (!answer) return base;
  if (!base) return answer;
  var normalize = function (v) {
    if (key === 'phone') return v.replace(/\D/g, '');
    return key === 'email' ? v.trim().toLowerCase() : v.trim().replace(/\s+/g, ' ').toLowerCase();
  };
  if (normalize(base) === normalize(answer)) return base;
  var segment = '\nForm answer: ' + answer, start = base.indexOf(segment);
  while (start !== -1) {
    var end = start + segment.length;
    if (end === base.length || base.charAt(end) === '\n' || base.charAt(end) === '\r') return base;
    start = base.indexOf(segment, start + 1);
  }
  return base + segment;
}

function sheetsCell(value, numeric) {
  var number = typeof value === 'number' ? value : typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim()) ? Number(value.trim()) : NaN;
  if (numeric && Number.isFinite(number)) return { value: number, format: Number.isInteger(number) ? '#,##0' : '#,##0.0#########' };
  return { value: sheetsText(value), format: '@' };
}

function sheetsValue(column, event, reg) {
  if (column.key.indexOf('detail:') === 0) {
    var path = JSON.parse(column.key.slice(7)), entries = (reg.data || {})[path[0]], value;
    if (path[1] === 'count') return Array.isArray(entries) ? entries.length : '';
    if (path[1] === 'entry') value = Array.isArray(entries) && entries[path[2]] ? entries[path[2]][path[3]] : '';
    if (path[1] === 'row') value = entries && typeof entries === 'object' ? entries[path[2]] : '';
    return Array.isArray(value) ? value.join(', ') : value == null ? '' : value;
  }
  if (column.key === 'event') return event.name;
  if (column.key === 'booth' || column.key === 'vendor_type') {
    var booths = reg.registration_booths && reg.registration_booths.length ? reg.registration_booths.map(function (r) { return r.booths; }) : [reg.booths];
    var values = booths.filter(Boolean).map(function (b) { return column.key === 'booth' ? b.number : b.label; })
      .filter(function (v) { return v !== null && v !== undefined && v !== ''; });
    if (column.key === 'vendor_type') values = values.filter(function (v, i) { return values.indexOf(v) === i; });
    return values.join(' + ');
  }
  if (SHEETS_CONTACT_KEYS.indexOf(column.key) !== -1) {
    var source = column.source;
    return source ? sheetsMerge(column.key, reg[column.key], sheetsValue({ key: 'answer:' + source.id }, event, reg)) : reg[column.key];
  }
  if (column.key.indexOf('answer:') !== 0) return reg[column.key];
  var value = (reg.data || {})[column.key.slice(7)];
  var field = (event.form_schema || []).filter(function (f) { return f.id === column.key.slice(7); })[0];
  if (field && field.type === 'repeat_group') return sheetsRepeatText(field, value);
  if (typeof value === 'string' && /^data:image\//i.test(value)) return 'Signature captured (view in app)';
  if (value && typeof value === 'object' && 'bucket' in value && 'path' in value) return value.name || 'File (view in app)';
  if (field && value && typeof value === 'object') {
    if (field.type === 'menu_quantity') return Object.keys(value).filter(function (k) { return Number(value[k]) > 0; }).map(function (k) { return k + ' × ' + value[k]; }).join(', ');
    if (field.type === 'grid' || field.type === 'checkbox_grid') {
      var keys = (field.rows || []).concat(Object.keys(value).filter(function (k) { return (field.rows || []).indexOf(k) === -1; }));
      return keys.filter(function (k) { return value[k] !== undefined && value[k] !== null && value[k] !== ''; }).map(function (k) { return k + ': ' + (Array.isArray(value[k]) ? value[k].join(', ') : value[k]); }).join('; ');
    }
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map(function (v) { return typeof v === 'object' ? JSON.stringify(v) : String(v); }).join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return value;
}

function sheetsResolve(event) {
  var id = sheetsDestination(event.settings && event.settings.googleSheetUrl);
  if (!id) throw new Error('Invalid Google Sheet link.');
  var book = SpreadsheetApp.openById(id), tab = sheetsEventTab(book, event);
  return { book: book, tab: tab, layout: sheetsLayout(tab, event, sheetsPlan(event)) };
}

function writeEventRows(event, rows, updateExisting) {
  if (rows.some(function (r) { return r.event_id !== event.id; })) throw new Error('Registration event mismatch.');
  return sheetsWriteRows(sheetsResolve(event), event, rows, updateExisting);
}

function sheetsWriteRows(destination, event, rows, updateExisting, deferDecoration) {
  // Older answers can exceed a subsequently reduced form limit.
  var expanded = false;
  var schema = (event.form_schema || []).map(function (f) {
    if (f.type !== 'repeat_group') return f;
    var max = Math.max.apply(null, [f.maxItems || (f.countMode === 'number' ? 10 : 6)].concat(rows.map(function (r) {
      var value = (r.data || {})[f.id]; return Array.isArray(value) ? value.length : 0;
    })));
    if (max <= (f.maxItems || (f.countMode === 'number' ? 10 : 6))) return f;
    expanded = true; return Object.assign({}, f, { maxItems: max });
  });
  if (expanded) destination.layout = sheetsLayout(destination.tab, event, sheetsPlan(Object.assign({}, event, { form_schema: schema })));
  var tab = destination.tab, layout = destination.layout, columns = layout.columns, header = layout.headerRow;
  var last = Math.max(header, tab.getLastRow()), seen = Object.create(null), pending = Object.create(null), added = [], updates = [];
  if (last > header) tab.getRange(header + 1, 1, last - header, 1).getValues().forEach(function (r, i) { if (r[0]) seen[String(r[0])] = header + i + 1; });
  rows.forEach(function (reg) {
    if (reg.event_id !== event.id) throw new Error('Registration event mismatch.');
    if (!reg.id) throw new Error('Registration ID missing.');
    var cells = columns.map(function (c) { return sheetsCell(c.target.excluded ? '' : sheetsValue(c.target, event, reg), !c.target.excluded && c.target.kind === 'number'); });
    if (seen[reg.id]) {
      if (updateExisting) updates.push({ row: seen[reg.id], cells: cells });
    } else if (pending[reg.id] !== undefined) {
      if (updateExisting) added[pending[reg.id]] = cells;
    } else { pending[reg.id] = added.length; added.push(cells); }
  });
  updates.map(function (update) { return update.cells; }).concat(added).forEach(function (cells) {
    cells.forEach(function (cell, i) {
      if (typeof cell.value === 'number' && !Number.isInteger(cell.value)) columns[i].flags.decimals = true;
    });
  });
  // Save sticky precision before rows so a failed write cannot lose the decision.
  sheetsSaveNotes(tab, layout);
  updates.forEach(function (update) { sheetsWriteCells(tab.getRange(update.row, 1, 1, columns.length), [update.cells]); });
  sheetsEnsureSize(tab, last + added.length + 1, columns.length);
  if (added.length) sheetsWriteCells(tab.getRange(last + 1, 1, added.length, columns.length), added);
  if (!deferDecoration) {
    sheetsDecorate(tab, event, layout);
    sheetsRename(destination.book, tab, event);
  }
  SpreadsheetApp.flush();
  return { added: added.length, updated: updates.length };
}

function sheetsWriteCells(range, rows) {
  range.setNumberFormats(rows.map(function (r) { return r.map(function (c) { return c.format; }); }))
    .setValues(rows.map(function (r) { return r.map(function (c) { return c.value; }); }));
}

function sheetsFingerprint(event) {
  var s = event.settings || {};
  var fields = (event.form_schema || []).map(function (f) {
    return [f.id, f.type, f.label, f.mapTo, f.collectNames, sheetsStable(f.options), sheetsStable(f.rows),
      sheetsStable(f.subFields), f.itemLabel, f.countMode, f.maxItems];
  });
  var serialized = JSON.stringify([SHEETS_FORMAT_VERSION, event.name, event.event_date, event.start_time, event.end_time, event.location,
    s.formType, sheetsTabName(s, event.name), (s.googleSheetTotals || []).slice().sort(), (s.googleSheetExclude || []).slice().sort(), fields]);
  var hash = 2166136261;
  for (var i = 0; i < serialized.length; i++) { hash ^= serialized.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return ('00000000' + (hash >>> 0).toString(16)).slice(-8);
}

function sheetsStable(value) {
  if (Array.isArray(value)) return value.map(sheetsStable);
  if (value && typeof value === 'object') return Object.keys(value).sort().map(function (key) { return [key, sheetsStable(value[key])]; });
  return value === undefined ? null : value;
}

function refreshEventSheet(payload) {
  verifySheetAdmin(payload.accessToken);
  if (!/^[a-f0-9-]{36}$/i.test(String(payload.eventId || ''))) throw new Error('Invalid event.');
  var events = supabaseGet('/rest/v1/events?select=id,name,settings,form_schema,event_date,start_time,end_time,location&id=eq.' + encodeURIComponent(payload.eventId));
  var event = events[0];
  if (!event || !sheetsDestination(event.settings && event.settings.googleSheetUrl)) throw new Error('Save a Google Sheet link in this event’s settings first.');
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error('Another sync is running. Please try Refresh again.');
  try {
    var destination = sheetsResolve(event), tab = destination.tab, fingerprint = sheetsFingerprint(event), stored;
    try { stored = JSON.parse(sheetsMetaGet(tab, 'headstart_refresh')); } catch (err) { stored = null; }
    var continuing = stored && payload.runId === stored.id && stored.fingerprint === fingerprint;
    var restarted = !continuing && !!(payload.runId || payload.cursor);
    var run = continuing ? stored : { id: Utilities.getUuid(), fingerprint: fingerprint, cursor: '', started: new Date().toISOString() };
    sheetsMetaSet(tab, 'headstart_refresh', JSON.stringify(run));
    var added = 0, updated = 0, complete = false, deadline = Date.now() + 200000;
    for (var page = 0; page < 20 && Date.now() < deadline; page++) {
      var path = '/rest/v1/registrations?select=id,event_id,reference,name,email,phone,status,created_at,data,booths!registrations_booth_id_fkey(label,number),registration_booths(booths(label,number))' +
        '&event_id=eq.' + encodeURIComponent(event.id) + '&order=id.asc&limit=' + SHEETS_BATCH_SIZE + (run.cursor ? '&id=gt.' + encodeURIComponent(run.cursor) : '');
      var rows = supabaseGet(path), result = sheetsWriteRows(destination, event, rows, true, true);
      added += result.added; updated += result.updated;
      if (!rows.length) { complete = true; break; }
      run.cursor = rows[rows.length - 1].id;
      sheetsMetaSet(tab, 'headstart_refresh', JSON.stringify(run));
    }
    if (complete) {
      var needed = sheetsMetaGet(tab, 'headstart_refresh_needed');
      if (needed && needed < run.started) sheetsMetaSet(tab, 'headstart_refresh_needed', null);
      sheetsMetaSet(tab, 'headstart_refresh', null);
    }
    sheetsDecorate(tab, event, destination.layout);
    sheetsRename(destination.book, tab, event);
    SpreadsheetApp.flush();
    return { added: added, updated: updated, complete: complete, runId: run.id, restarted: restarted,
      url: event.settings.googleSheetUrl, tabName: tab.getName(), gid: tab.getSheetId() };
  } finally { lock.releaseLock(); }
}

function sheetRefreshPage(payload) {
  var escape = function (s) { return String(s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }, body;
  try {
    var result = refreshEventSheet(payload);
    body = '<h1>' + (result.complete ? 'Google Sheet refreshed' : 'Refresh in progress') + '</h1><p>' + result.added + ' rows added; ' + result.updated + ' rows updated in this batch.</p>';
    if (result.restarted) body += '<p>Refresh restarted from the beginning because the saved run or export settings changed.</p>';
    if (!result.complete) {
      var next = JSON.stringify({ action: 'google_sheet_refresh', eventId: payload.eventId, accessToken: payload.accessToken, runId: result.runId });
      body += '<p>This event needs another batch. Nothing runs in the background.</p><form method="post" target="_top" action="' + escape(ScriptApp.getService().getUrl()) + '"><input type="hidden" name="request" value="' + escape(next) + '"><button type="submit">Continue refresh</button></form>';
    }
    body += '<p><a target="_blank" rel="noopener noreferrer" href="https://docs.google.com/spreadsheets/d/' + sheetsDestination(result.url) + '/edit#gid=' + escape(result.gid) + '">Open Google Sheet: ' + escape(result.tabName) + '</a></p>';
  } catch (err) { body = '<h1>Sheet refresh failed</h1><p>' + escape(String(err)) + '</p><p>Return to the app and try again after correcting the problem. Saved registrations are retained.</p>'; }
  return HtmlService.createHtmlOutput('<!doctype html><html><head><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="font:16px Arial,sans-serif;max-width:640px;margin:48px auto;padding:24px;color:#1a3c5e">' + body + '</body></html>');
}

var SHEETS_STYLE = {
  navy: '#1a3c5e', gold: '#f0b323', white: '#ffffff', band: '#eef3f8', text: '#14202e',
  status: { confirmed: ['#dcfce7', '#166534'], pending: ['#fdf7e7', '#8f5e0c'], waitlist: ['#d5e0ec', '#1a3c5e'],
    rejected: ['#fee2e2', '#991b1b'], cancelled: ['#f1f5f9', '#64748b'] }
};
var SHEETS_WIDTHS = { reference: 110, created_at: 170, event: 200, name: 190, email: 230, phone: 130, booth: 130, status: 110 };

function sheetsDecorate(tab, event, layout) {
  try { sheetsHeading(tab, event, layout); }
  catch (err) { console.warn('Sheet title/summary skipped: ' + err); }
  try { styleRegistrationsSheet(tab, layout.columns, Math.max(tab.getLastRow(), layout.headerRow), layout.headerRow); }
  catch (err) { console.warn('Sheet styling skipped: ' + err); }
}

function sheetsColumnLetter(index) {
  var letters = '';
  while (index > 0) { index--; letters = String.fromCharCode(65 + index % 26) + letters; index = Math.floor(index / 26); }
  return letters;
}

function sheetsHeading(tab, event, layout) {
  var columns = layout.columns, header = layout.headerRow, first = header + 1, width = columns.length;
  var totals = columns.map(function (c, i) { return c.target.total && !c.target.excluded && !c.target.merged ? i : -1; }).filter(function (i) { return i >= 0; });
  var visible, label;
  for (var index = 0; index < width; index++) {
    if (columns[index].flags.hidden || tab.isColumnHiddenByUser(index + 1)) continue;
    if (visible === undefined) visible = index;
    if (totals.indexOf(index) === -1) { label = index; break; }
  }
  tab.getRange(1, 1, 2, width).clearContent().setNumberFormat('@');
  tab.getRange(header - 1, 1, 1, width).clearContent().setNumberFormat('@');
  if (visible !== undefined) {
    tab.getRange(1, visible + 1, 1, 1).setValue(sheetsText(event.name));
    var date = event.event_date ? Utilities.formatDate(new Date(event.event_date), 'UTC', 'EEEE d MMMM yyyy') : '';
    var time = [event.start_time, event.end_time].filter(Boolean).map(function (v) { return String(v).slice(0, 5); }).join('–');
    var details = [date, time, event.location, 'Updated ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'd MMM yyyy, HH:mm')].filter(Boolean).join(' • ');
    tab.getRange(2, visible + 1, 1, 1).setValue(sheetsText(details));
  }
  if (label !== undefined) {
    var ids = 'A' + first + ':A', count = 'COUNTA(' + ids + ')', shown = 'SUBTOTAL(103,' + ids + ')';
    var noun = event.settings && event.settings.formType === 'survey' ? 'responses' : 'registrations';
    var prefix = totals.length ? '"Total for "&' : '';
    var note = sheetsMetaGet(tab, 'headstart_refresh_needed') ? '&" — New columns: click Refresh Google Sheet in the app to fill older rows"' : '';
    var formula = '=' + prefix + 'IF(' + shown + '=' + count + ',' + count + '&" ' + noun + '",' + shown + '&" of "&' + count + '&" ' + noun + ' shown")' + note;
    tab.getRange(header - 1, label + 1, 1, 1).setNumberFormat('#,##0').setFormulas([[formula]]);
  }
  totals.forEach(function (i) {
    var letter = sheetsColumnLetter(i + 1);
    tab.getRange(header - 1, i + 1, 1, 1).setNumberFormat(columns[i].flags.decimals ? '#,##0.0#' : '#,##0')
      .setFormulas([['=SUBTOTAL(109,' + letter + first + ':' + letter + ')']]);
  });
}

function styleRegistrationsSheet(tab, columns, rows, header) {
  var width = columns.length, s = SHEETS_STYLE;
  tab.setTabColor(s.navy); tab.setFrozenRows(header); tab.setHiddenGridlines(true);
  tab.getRange(1, 1, 2, width).setBackground(s.navy).setFontFamily('Arial').setFontColor(s.white).setWrap(false);
  tab.getRange(1, 1, 1, width).setFontSize(16).setFontWeight('bold'); tab.setRowHeight(1, 36);
  tab.getRange(2, 1, 1, width).setFontSize(10).setFontColor('#d5e0ec')
    .setBorder(null, null, true, null, null, null, s.gold, SpreadsheetApp.BorderStyle.SOLID_THICK);
  tab.setRowHeight(2, 30);
  tab.getRange(header - 1, 1, 1, width).setBackground('#fdf7e7').setFontColor(s.navy).setFontWeight('bold').setWrap(false);
  tab.setRowHeight(header, 40);
  tab.getRange(header, 1, 1, width).setBackground(s.navy).setFontColor(s.white).setFontFamily('Arial').setFontSize(11)
    .setFontWeight('bold').setVerticalAlignment('middle').setHorizontalAlignment('left').setWrap(true)
    .setBorder(null, null, true, null, null, null, s.gold, SpreadsheetApp.BorderStyle.SOLID_THICK);
  if (rows > header) tab.getRange(header + 1, 1, rows - header, width).setFontFamily('Arial').setFontSize(10).setFontColor(s.text)
    .setVerticalAlignment('top').setBorder(null, null, null, null, null, true, '#d5e0ec', SpreadsheetApp.BorderStyle.SOLID);
  var table = tab.getRange(header, 1, rows - header + 1, width), banding = tab.getBandings()[0];
  if (banding) banding.setRange(table);
  else banding = table.applyRowBanding(SpreadsheetApp.BandingTheme.BLUE, true, false);
  banding.setHeaderRowColor(s.navy).setFirstRowColor(s.white).setSecondRowColor(s.band);
  var filterRange = tab.getRange(header, 1, tab.getMaxRows() - header + 1, width), filter = tab.getFilter(), criteria = [];
  if (filter && filter.getRange().getA1Notation() !== filterRange.getA1Notation()) {
    for (var i = 1; i <= filter.getRange().getNumColumns(); i++) criteria[i] = filter.getColumnFilterCriteria(i);
    filter.remove(); filter = null;
  }
  if (!filter) {
    filter = filterRange.createFilter();
    criteria.forEach(function (criterion, i) { if (criterion && i <= width) filter.setColumnFilterCriteria(i, criterion); });
  }
  columns.forEach(function (c, i) {
    tab.setColumnWidth(i + 1, c.key === 'id' ? 90 : SHEETS_WIDTHS[c.key] || 240);
    if (rows > header && c.key.indexOf('answer:') === 0) tab.getRange(header + 1, i + 1, rows - header, 1).setWrap(true);
  });
  tab.hideColumns(1);
  var status = columns.map(function (c) { return c.key; }).indexOf('status');
  if (status !== -1) {
    var range = tab.getRange(header + 1, status + 1, tab.getMaxRows() - header, 1).setHorizontalAlignment('center').setFontWeight('bold');
    tab.setConditionalFormatRules(Object.keys(s.status).map(function (name) {
      return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(name).setBackground(s.status[name][0]).setFontColor(s.status[name][1]).setRanges([range]).build();
    }));
  }
}

function sheetsRepeatText(field, value) {
  if (!Array.isArray(value)) return '';
  var label = String(field.itemLabel || '').trim() || 'Entry';
  var lines = value.map(function (entry, i) {
    var parts = (field.subFields || []).map(function (sub) {
      var v = entry && entry[sub.id] !== null && entry[sub.id] !== undefined ? String(entry[sub.id]).trim() : '';
      return v ? sub.label + ': ' + v : '';
    }).filter(Boolean);
    return label + ' ' + (i + 1) + ': ' + (parts.length ? parts.join('; ') : '(no details)');
  });
  return (field.countMode === 'number' ? [String(value.length)].concat(lines) : lines).join('\n');
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
