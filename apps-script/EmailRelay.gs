/**
 * ============================================================
 * HeadStart Events - Email Relay (Google Apps Script)
 * ============================================================
 * Sends confirmation emails from your school Gmail account when
 * someone registers on the HeadStart Events website.
 *
 * HOW IT WORKS
 * The website calls this web app with only a reference number.
 * The script looks the registration up in Supabase using the
 * service key (stored safely in Script Properties, never in the
 * website), renders the event's email template, and sends it
 * with MailApp. It then marks the registration as emailed so
 * duplicates are not sent.
 *
 * SETUP (one time, about 5 minutes)
 * 1. Go to https://script.google.com and create a new project
 *    named "HeadStart Events Email Relay".
 * 2. Paste this whole file into Code.gs.
 * 3. Open Project Settings (gear icon) -> Script Properties and add:
 *       SUPABASE_URL          https://YOUR-PROJECT-REF.supabase.co
 *       SERVICE_ROLE_KEY      (Supabase Dashboard -> Project Settings -> API Keys ->
 *                              Legacy API Keys -> service_role)
 *       FROM_NAME             HeadStart Events
 * 4. Deploy -> New deployment -> type: Web app
 *       Execute as: Me
 *       Who has access: Anyone
 *    Copy the web app URL (ends in /exec).
 * 5. Paste that URL into HeadStart Events -> Settings -> Email & notifications
 *    -> Relay web app URL, and save. Do this for every campus.
 * 6. Optional daily summary: in the Triggers page (clock icon),
 *    add a trigger for dailySummary, time driven, every day 07:00 to 08:00.
 *
 * UPDATING TO A NEW VERSION OF THIS FILE
 * Paste the new file over all the old code and save. Then choose
 * Deploy -> Manage deployments -> pencil icon (Edit) ->
 * Version: New version -> Deploy. The web app URL stays the same,
 * so nothing needs changing in HeadStart Events. Do not choose
 * "New deployment": that creates a different URL.
 *
 * CHECKING THE RELAY
 * - Open the web app URL in a browser. It shows the deployed version,
 *   which should match RELAY_VERSION below.
 * - In the editor, choose checkSetup in the toolbar, press Run and read
 *   the Execution log. It sends no email and changes nothing.
 *
 * NOTE ON QUOTAS: MailApp counts every recipient. Google Workspace
 * accounts may email about 1,500 recipients per day, free Gmail
 * accounts about 100. checkSetup shows what is left today.
 * ============================================================
 */

var PROPS = PropertiesService.getScriptProperties();
// Trimmed, because a space or line break pasted with a value is enough for
// Supabase to refuse every request.
var SUPABASE_URL = (PROPS.getProperty('SUPABASE_URL') || '').trim().replace(/\/+$/, '');
var SERVICE_KEY = (PROPS.getProperty('SERVICE_ROLE_KEY') || '').trim();
var FROM_NAME = PROPS.getProperty('FROM_NAME') || 'HeadStart Events';

// Change this whenever the file changes, so the deployed copy can be checked.
var RELAY_VERSION = '2026-10-02';

// ------------------------------------------------------------
// Web app entry points
// ------------------------------------------------------------

// Opening the web app URL in a browser shows which version is deployed.
function doGet() {
  return jsonOut({ ok: true, relay: 'HeadStart Events email relay', version: RELAY_VERSION });
}

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents || '{}');
    var cache = CacheService.getScriptCache();

    if (payload.test) {
      var campusId = String(payload.campus || 'hsc');
      // Anyone who finds the relay URL can ask for a test, so one test per
      // campus per minute keeps staff inboxes and the daily quota safe.
      if (cache.get('test_' + campusId)) return jsonOut({ ok: true, test: true, skipped: 'cooldown' });
      cache.put('test_' + campusId, '1', 60);
      var camp = fetchCampus(campusId);
      var recips = notifyList(camp);
      if (recips.length) {
        MailApp.sendEmail({
          to: recips.join(','),
          subject: 'HeadStart Events: test email (' + (camp && camp.name ? camp.name : 'campus') + ')',
          htmlBody: '<p>Your email relay is working correctly. This test was sent to the relay test recipients for this campus, not to any form\'s notification list.</p>',
          name: FROM_NAME,
        });
      }
      return jsonOut({ ok: true, test: true, recipients: recips.length });
    }

    var reference = String(payload.reference || '').trim().toUpperCase();
    if (!reference) return jsonOut({ ok: false, error: 'missing reference' });

    // Basic abuse guard: one send per reference per 5 minutes.
    if (cache.get('sent_' + reference)) return jsonOut({ ok: true, skipped: 'cooldown' });

    var reg = fetchRegistration(reference);
    if (!reg) return jsonOut({ ok: false, error: 'not found' });
    if (reg.email_sent_at && !payload.resend) return jsonOut({ ok: true, skipped: 'already sent' });

    var event = reg.events;
    var template = defaults(event.email_template);
    // Survey, questionnaire or feedback form: a plain thank you email, never a
    // registration confirmation (no QR code, calendar file or booth details).
    var isSurvey = !!(event.settings && event.settings.formType === 'survey');
    if (isSurvey) {
      template.showQr = false;
      template.attachCalendar = false;
    }
    // Who is told about this submission comes only from the form's own saved
    // list. Campus and global addresses are never used for registration or
    // response data, so one form's replies never reach another form's staff.
    // A resend repeats the confirmation only: the form's recipients were told
    // when the entry first arrived, and must not be told again as if it were new.
    var alreadyNotified = !!(payload.resend && reg.email_sent_at);
    var adminTo = template.adminNotify && !alreadyNotified ? template.adminEmails : [];
    // Surveys may be answered anonymously, so a confirmation needs an address
    // to send to, not merely an enabled template.
    var sendConfirmation = template.enabled && !!reg.email;
    if (!sendConfirmation && !adminTo.length) return jsonOut({ ok: true, skipped: 'no recipients' });

    if (sendConfirmation) {
      var campus = fetchCampus(event.campus_id || 'hsc');
      var settings2 = mergeSettings(fetchAppSettings(), campus);
      var mergeMap = buildMergeMap(event, reg);
      var subject = renderMerge(template.subject, mergeMap);
      var htmlBody = buildEmailHtml(template, mergeMap, event, reg, settings2);

      var mailOptions = {
        to: reg.email,
        subject: subject,
        htmlBody: htmlBody,
        name: FROM_NAME,
      };

      if (template.attachCalendar && event.event_date) {
        var ics = buildIcs(event, reference);
        if (ics) {
          mailOptions.attachments = [Utilities.newBlob(ics, 'text/calendar', event.slug + '.ics')];
        }
      }

      MailApp.sendEmail(mailOptions);
    }
    cache.put('sent_' + reference, '1', 300);

    if (adminTo.length) {
      MailApp.sendEmail({
        to: adminTo.join(','),
        subject: (isSurvey ? 'New response: ' : 'New registration: ') + event.name + ' (' + reference + ')',
        htmlBody: isSurvey
          ? '<p><strong>' + esc(reg.name || 'Anonymous') + '</strong> submitted a response to <strong>' + esc(event.name) + '</strong>.</p>' +
            '<p>Reference: ' + esc(reference) +
            '<br/>Email: ' + esc(reg.email || '-') + '</p>'
          : '<p><strong>' + esc(reg.name || 'Unnamed') + '</strong> registered for <strong>' + esc(event.name) + '</strong>.</p>' +
            '<p>Reference: ' + esc(reference) +
            '<br/>Email: ' + esc(reg.email || '-') +
            '<br/>Phone: ' + esc(reg.phone || '-') +
            '<br/>Booth: ' + esc(buildMergeMap(event, reg).booth) +
            '<br/>Status: ' + esc(reg.status) + '</p>',
        name: FROM_NAME,
      });
    }

    markEmailSent(reg.id);
    return jsonOut({ ok: true });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

// ------------------------------------------------------------
// Optional: daily summary email (add a time driven trigger)
// ------------------------------------------------------------
function dailySummary() {
  var campuses = supabaseGet('/rest/v1/campuses?select=*');
  if (!campuses) return;
  campuses.forEach(function (camp) { dailySummaryForCampus(camp); });
}

function dailySummaryForCampus(camp) {
  var since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  var rows = supabaseGet(
    '/rest/v1/registrations?select=reference,name,email,status,created_at,events!inner(id,name,campus_id,email_template)&events.campus_id=eq.' +
    encodeURIComponent(camp.id) + '&created_at=gte.' +
    encodeURIComponent(since) + '&order=created_at.desc&limit=200'
  );
  if (!rows || rows.length === 0) return;

  // Group by event ID, not by name: two forms may share a name, and their
  // replies must never be mixed into one another's summary.
  var byEvent = {};
  rows.forEach(function (r) {
    var event = r.events;
    if (!event || !event.id) return;
    if (!byEvent[event.id]) byEvent[event.id] = { event: event, rows: [] };
    byEvent[event.id].rows.push(r);
  });

  // One summary per form, to that form's own recipients.
  Object.keys(byEvent).forEach(function (id) {
    var group = byEvent[id];
    var template = defaults(group.event.email_template);
    if (!template.adminNotify || !template.adminEmails.length) return;
    var html = '<h2 style="font-family:Arial">Daily registration summary</h2>' +
      '<h3 style="font-family:Arial;color:#1a3c5e">' + esc(group.event.name) + ' (' + group.rows.length + ')</h3>' +
      '<ul style="font-family:Arial;font-size:13px">';
    group.rows.forEach(function (r) {
      html += '<li>' + esc(r.name || 'Unnamed') + ' - ' + esc(r.email || '') + ' - ' + esc(r.reference) + ' - ' + esc(r.status) + '</li>';
    });
    html += '</ul>';
    MailApp.sendEmail({
      to: template.adminEmails.join(','),
      subject: 'HeadStart Events: ' + group.event.name + ' - ' + group.rows.length + ' registration(s) in the last 24 hours',
      htmlBody: html,
      name: FROM_NAME,
    });
  });
}

// ------------------------------------------------------------
// Setup check: choose checkSetup in the editor toolbar, press Run,
// then read the Execution log. It sends no email and changes nothing.
// ------------------------------------------------------------
function checkSetup() {
  Logger.log('Relay version: ' + RELAY_VERSION);
  if (!SUPABASE_URL) throw new Error('Script Property SUPABASE_URL is missing.');
  if (!SERVICE_KEY) throw new Error('Script Property SERVICE_ROLE_KEY is missing.');
  var kind = keyKind();
  if (kind !== 'service_role' && kind !== 'secret') {
    throw new Error('SERVICE_ROLE_KEY holds the wrong key (' + kind + '). Copy the service_role key from ' +
      'Supabase -> Project Settings -> API Keys -> Legacy API Keys.');
  }
  Logger.log('Key type: ' + (kind === 'secret' ? 'new secret key (sb_secret_...)' : 'legacy service_role key'));
  var campuses;
  try {
    campuses = supabaseGet('/rest/v1/campuses?select=id,name,webhook_url&order=sort_order');
  } catch (err) {
    throw new Error('Supabase refused the connection. Check SUPABASE_URL and SERVICE_ROLE_KEY. ' + err.message);
  }
  Logger.log('Supabase connection: OK');
  // A campus without its own URL falls back to the older global one, so both
  // are listed. Each should be this deployment's web app URL.
  var globalUrl = fetchAppSettings().webhook_url;
  campuses.forEach(function (c) {
    Logger.log('Relay URL for ' + c.name + ': ' + (c.webhook_url || 'not set, uses the global URL ' + (globalUrl || '(not set either)')));
  });
  Logger.log('Script time zone (used by the daily summary trigger): ' + Session.getScriptTimeZone());
  Logger.log('Email recipients left today: ' + MailApp.getRemainingDailyQuota());
}

// ------------------------------------------------------------
// Supabase helpers
// ------------------------------------------------------------

// Legacy keys are JWTs and are sent in both headers. The newer keys
// (sb_secret_...) are not JWTs, and Supabase takes them in the apikey header only.
function isJwtKey() {
  return !/^sb_/.test(SERVICE_KEY);
}

function supabaseHeaders() {
  var headers = { apikey: SERVICE_KEY };
  if (isJwtKey()) headers.Authorization = 'Bearer ' + SERVICE_KEY;
  return headers;
}

// Which key SERVICE_ROLE_KEY holds. The anon key sits right next to
// service_role in Supabase, and with it every lookup quietly finds nothing.
function keyKind() {
  if (/^sb_secret_/.test(SERVICE_KEY)) return 'secret';
  if (!isJwtKey()) return 'publishable';
  try {
    var part = SERVICE_KEY.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    var claims = JSON.parse(Utilities.newBlob(Utilities.base64Decode(part + '==='.slice((part.length + 3) % 4))).getDataAsString());
    return claims.role || 'unknown';
  } catch (e) {
    return 'unknown';
  }
}

function supabaseGet(path) {
  var res = UrlFetchApp.fetch(SUPABASE_URL + path, {
    headers: supabaseHeaders(),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) throw new Error('Supabase error: ' + res.getContentText());
  return JSON.parse(res.getContentText());
}

function fetchRegistration(reference) {
  var rows = supabaseGet(
    '/rest/v1/registrations?select=*,events(*),booths!registrations_booth_id_fkey(label,number),registration_booths(booths(label,number))&reference=eq.' + encodeURIComponent(reference)
  );
  return rows && rows[0];
}

function fetchAppSettings() {
  var rows = supabaseGet('/rest/v1/app_settings?select=*&id=eq.1');
  return (rows && rows[0]) || {};
}

// Campus branding overrides the legacy global app_settings.
function mergeSettings(base, campus) {
  base = base || {};
  if (!campus) return base;
  return {
    school_name: campus.school_name || base.school_name,
    logo_url: campus.logo_url || base.logo_url,
    email_logo_url: campus.email_logo_url || base.email_logo_url,
    admin_email: base.admin_email,
  };
}

function fetchCampus(id) {
  if (!id) id = 'hsc';
  var rows = supabaseGet('/rest/v1/campuses?select=*&id=eq.' + encodeURIComponent(id));
  return (rows && rows[0]) || null;
}

// Campus recipients are used only by the explicit relay test, never for
// registration or response data.
function notifyList(campus) {
  var list = [];
  if (campus && campus.notify_emails) {
    var arr = campus.notify_emails;
    if (typeof arr === 'string') { try { arr = JSON.parse(arr); } catch (e) { arr = []; } }
    if (arr && arr.length) list = arr.slice();
  }
  return list.filter(function (x) { return x && x.indexOf('@') > 0; });
}

/**
 * The recipients saved on one form. An explicit list replaces the older single
 * address, even when that list is empty, so clearing the box really does mean
 * "tell nobody" rather than quietly falling back to the campus list.
 * Mirrors normalizeNotificationEmails and invalidNotificationEmails in
 * src/lib/notificationEmails.ts, so the admin screen and the relay agree.
 */
function formNotifyList(template) {
  template = template || {};
  var entries = Array.isArray(template.adminEmails)
    ? template.adminEmails
    : String(template.adminEmail || '').split(/[,;\n]/);
  var seen = {};
  return entries.filter(function (entry) { return typeof entry === 'string'; })
    .map(function (email) { return email.trim().toLowerCase(); })
    .filter(function (email) {
      if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email) || seen[email]) return false;
      seen[email] = true;
      return true;
    });
}

function markEmailSent(id) {
  var headers = supabaseHeaders();
  headers.Prefer = 'return=minimal';
  UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/registrations?id=eq.' + id, {
    method: 'patch',
    contentType: 'application/json',
    headers: headers,
    payload: JSON.stringify({ email_sent_at: new Date().toISOString() }),
    muteHttpExceptions: true,
  });
}

// ------------------------------------------------------------
// Rendering (mirrors the preview in the admin dashboard)
// ------------------------------------------------------------
function defaults(t) {
  t = t || {};
  return {
    enabled: t.enabled !== false,
    subject: t.subject || 'Registration confirmed: {{Event}}',
    body: t.body || '<p>Dear Khun {{Name}},</p><p>Thank you for registering for {{Event}}.</p><p>Reference: {{ReferenceNumber}}</p>',
    showLogo: t.showLogo !== false,
    showBanner: !!t.showBanner,
    showQr: t.showQr !== false,
    attachCalendar: t.attachCalendar !== false,
    buttonLabel: t.buttonLabel || '',
    buttonUrl: t.buttonUrl || '',
    adminNotify: t.adminNotify !== false,
    adminEmails: formNotifyList(t),
  };
}

function buildMergeMap(event, reg) {
  var boothText = 'Not applicable';
  var list = [];
  if (reg.registration_booths && reg.registration_booths.length) {
    reg.registration_booths.forEach(function (rb) {
      if (rb.booths) list.push(((rb.booths.label || '') + ' ' + (rb.booths.number ? '(No. ' + rb.booths.number + ')' : '')).trim());
    });
  } else if (reg.booths) {
    list.push(((reg.booths.label || '') + ' ' + (reg.booths.number ? '(No. ' + reg.booths.number + ')' : '')).trim());
  }
  if (list.length) boothText = list.join(' + ');
  return {
    name: reg.name || 'Guest',
    booth: boothText,
    event: event.name || '',
    // event_date is a plain YYYY-MM-DD, which reads as midnight UTC, so it is
    // formatted in UTC. The script's time zone setting can then never turn it
    // into the day before.
    date: event.event_date ? Utilities.formatDate(new Date(event.event_date), 'UTC', 'EEEE d MMMM yyyy') : 'To be announced',
    // As in the admin preview: "09:00 - 12:00", or the one time that is set.
    // A time left empty is saved as null.
    time: (event.start_time && event.end_time
      ? event.start_time + ' - ' + event.end_time
      : event.start_time || event.end_time) || 'To be announced',
    location: event.location || 'HeadStart International School Phuket',
    referencenumber: reg.reference || '',
  };
}

function renderMerge(text, map) {
  return String(text || '').replace(/\{\{\s*([A-Za-z]+)\s*\}\}/g, function (whole, key) {
    var v = map[key.toLowerCase()];
    return v !== undefined ? v : whole;
  });
}

function buildEmailHtml(template, mergeMap, event, reg, settings) {
  var branding = event.branding || {};
  var logoUrl = settings.email_logo_url || branding.logo_url || settings.logo_url || '';
  var bannerUrl = branding.banner_url || '';
  var qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=' + encodeURIComponent(reg.reference);
  // Merge values include what the person typed, such as their name, so they
  // go in as text. Otherwise anyone could put a link or markup into an email
  // that is sent from the school account.
  var htmlMap = {};
  Object.keys(mergeMap).forEach(function (key) { htmlMap[key] = esc(mergeMap[key]); });
  var body = renderMerge(template.body, htmlMap) + menuBlock(event, reg);

  var button = '';
  if (template.buttonLabel && template.buttonUrl) {
    button =
      '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto;"><tr><td style="background:#F0B323;border-radius:10px;">' +
      '<a href="' + renderMerge(template.buttonUrl, htmlMap) + '" style="display:inline-block;padding:12px 28px;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;color:#1a3c5e;text-decoration:none;">' +
      esc(template.buttonLabel) + '</a></td></tr></table>';
  }

  var qr = '';
  if (template.showQr) {
    qr =
      '<div style="text-align:center;margin:24px 0;">' +
      '<img src="' + qrUrl + '" alt="Check in QR code" width="150" height="150" style="border:1px solid #e2e8f0;border-radius:8px;"/>' +
      '<p style="font-family:Arial,sans-serif;font-size:12px;color:#64748b;margin-top:8px;">Show this QR code at the event for check in.</p></div>';
  }

  return (
    '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;"><tr><td align="center">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;">' +
    '<tr><td style="background:#1a3c5e;padding:20px 32px;text-align:center;">' +
    (template.showLogo && logoUrl
      ? '<img src="' + logoUrl + '" alt="School logo" height="56" style="height:56px;max-width:320px;object-fit:contain;"/>'
      : '<p style="font-family:Arial,sans-serif;color:#ffffff;font-size:18px;font-weight:bold;margin:8px 0 0;">' + esc(settings.school_name || 'HeadStart International School Phuket') + '</p>') +
    '</td></tr>' +
    (template.showBanner && bannerUrl ? '<tr><td><img src="' + bannerUrl + '" alt="" width="600" style="width:100%;display:block;"/></td></tr>' : '') +
    '<tr><td style="padding:32px;font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:#14202e;">' +
    body + button + qr +
    '</td></tr>' +
    '<tr><td style="background:#f8fafc;padding:16px 32px;text-align:center;">' +
    '<p style="font-family:Arial,sans-serif;font-size:11px;color:#94a3b8;margin:0;">This email was sent automatically by HeadStart Events. Please do not reply to this message.</p>' +
    '</td></tr></table></td></tr></table></body></html>'
  );
}

// Lists menu-with-quantity answers on the email, like a food ticket.
function menuBlock(event, reg) {
  try {
    var schema = event.form_schema || [];
    var html = '';
    schema.forEach(function (f) {
      if (f.type !== 'menu_quantity') return;
      var v = (reg.data || {})[f.id];
      if (!v || typeof v !== 'object') return;
      var lines = '';
      Object.keys(v).forEach(function (k) {
        if (v[k] > 0) lines += '<li>' + esc(k) + ' x ' + v[k] + '</li>';
      });
      if (lines) {
        html += '<div style="background:#f8fafc;border-radius:10px;padding:12px 16px;margin:16px 0;">' +
          '<p style="margin:0 0 6px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">' + esc(f.label) + '</p>' +
          '<ul style="margin:0;padding-left:18px;">' + lines + '</ul></div>';
      }
    });
    return html;
  } catch (e) {
    return '';
  }
}

function buildIcs(event, reference) {
  if (!event.event_date) return null;
  var d = String(event.event_date).replace(/-/g, '');
  var start = (event.start_time || '09:00').replace(':', '') + '00';
  var end = (event.end_time || event.start_time || '17:00').replace(':', '') + '00';
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HeadStart Events//EN',
    'BEGIN:VEVENT',
    'UID:' + reference + '-' + d + '@headstart-events',
    'DTSTAMP:' + Utilities.formatDate(new Date(), 'UTC', "yyyyMMdd'T'HHmmss'Z'"),
    'DTSTART:' + d + 'T' + start,
    'DTEND:' + d + 'T' + end,
    'SUMMARY:' + String(event.name || 'School event').replace(/[,;]/g, ' '),
    'LOCATION:' + String(event.location || 'HeadStart International School Phuket').replace(/[,;]/g, ' '),
    'DESCRIPTION:Registration reference ' + reference,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

// ------------------------------------------------------------
// Small utilities
// ------------------------------------------------------------
function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
