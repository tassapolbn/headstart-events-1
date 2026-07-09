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
 *       SERVICE_ROLE_KEY      (Supabase Dashboard -> Project Settings -> API -> service_role)
 *       FROM_NAME             HeadStart Events
 * 4. Deploy -> New deployment -> type: Web app
 *       Execute as: Me
 *       Who has access: Anyone
 *    Copy the web app URL (ends in /exec).
 * 5. Paste that URL into HeadStart Events -> Settings -> Relay web app URL.
 * 6. Optional daily summary: in the Triggers page (clock icon),
 *    add a trigger for dailySummary, time driven, every day 07:00 to 08:00.
 *
 * NOTE ON QUOTAS: Google Workspace accounts can send about 1,500
 * emails per day with MailApp, which is plenty for school events.
 * ============================================================
 */

var PROPS = PropertiesService.getScriptProperties();
var SUPABASE_URL = PROPS.getProperty('SUPABASE_URL');
var SERVICE_KEY = PROPS.getProperty('SERVICE_ROLE_KEY');
var FROM_NAME = PROPS.getProperty('FROM_NAME') || 'HeadStart Events';

// ------------------------------------------------------------
// Web app entry point
// ------------------------------------------------------------
function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents || '{}');

    if (payload.test) {
      var settings = fetchAppSettings();
      var to = settings.admin_email;
      if (to) {
        MailApp.sendEmail({
          to: to,
          subject: 'HeadStart Events: test email',
          htmlBody: '<p>Your email relay is working correctly.</p>',
          name: FROM_NAME,
        });
      }
      return jsonOut({ ok: true, test: true });
    }

    var reference = String(payload.reference || '').trim().toUpperCase();
    if (!reference) return jsonOut({ ok: false, error: 'missing reference' });

    // Basic abuse guard: one send per reference per 5 minutes.
    var cache = CacheService.getScriptCache();
    if (cache.get('sent_' + reference)) return jsonOut({ ok: true, skipped: 'cooldown' });

    var reg = fetchRegistration(reference);
    if (!reg) return jsonOut({ ok: false, error: 'not found' });
    if (reg.email_sent_at && !payload.resend) return jsonOut({ ok: true, skipped: 'already sent' });

    var event = reg.events;
    var template = defaults(event.email_template);
    if (!template.enabled) return jsonOut({ ok: true, skipped: 'disabled' });
    if (!reg.email) return jsonOut({ ok: false, error: 'registration has no email' });

    var settings2 = fetchAppSettings();
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
    cache.put('sent_' + reference, '1', 300);

    // Notify the administrator, if enabled.
    if (template.adminNotify) {
      var adminTo = template.adminEmail || settings2.admin_email;
      if (adminTo) {
        MailApp.sendEmail({
          to: adminTo,
          subject: 'New registration: ' + event.name + ' (' + reference + ')',
          htmlBody:
            '<p><strong>' + esc(reg.name || 'Unnamed') + '</strong> registered for <strong>' + esc(event.name) + '</strong>.</p>' +
            '<p>Reference: ' + reference +
            '<br/>Email: ' + esc(reg.email || '-') +
            '<br/>Phone: ' + esc(reg.phone || '-') +
            '<br/>Booth: ' + esc(buildMergeMap(event, reg).booth) +
            '<br/>Status: ' + reg.status + '</p>',
          name: FROM_NAME,
        });
      }
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
  var settings = fetchAppSettings();
  if (!settings.admin_email) return;

  var since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  var rows = supabaseGet(
    '/rest/v1/registrations?select=reference,name,email,status,created_at,events(name)&created_at=gte.' +
    encodeURIComponent(since) + '&order=created_at.desc&limit=200'
  );
  if (!rows || rows.length === 0) return;

  var byEvent = {};
  rows.forEach(function (r) {
    var name = (r.events && r.events.name) || 'Unknown event';
    byEvent[name] = byEvent[name] || [];
    byEvent[name].push(r);
  });

  var html = '<h2 style="font-family:Arial">Daily registration summary</h2>';
  Object.keys(byEvent).forEach(function (ev) {
    html += '<h3 style="font-family:Arial;color:#1a3c5e">' + esc(ev) + ' (' + byEvent[ev].length + ')</h3><ul style="font-family:Arial;font-size:13px">';
    byEvent[ev].forEach(function (r) {
      html += '<li>' + esc(r.name || 'Unnamed') + ' - ' + esc(r.email || '') + ' - ' + r.reference + ' - ' + r.status + '</li>';
    });
    html += '</ul>';
  });

  MailApp.sendEmail({
    to: settings.admin_email,
    subject: 'HeadStart Events: ' + rows.length + ' registration(s) in the last 24 hours',
    htmlBody: html,
    name: FROM_NAME,
  });
}

// ------------------------------------------------------------
// Supabase helpers
// ------------------------------------------------------------
function supabaseGet(path) {
  var res = UrlFetchApp.fetch(SUPABASE_URL + path, {
    headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) throw new Error('Supabase error: ' + res.getContentText());
  return JSON.parse(res.getContentText());
}

function fetchRegistration(reference) {
  var rows = supabaseGet(
    '/rest/v1/registrations?select=*,events(*),booths(label,number),registration_booths(booths(label,number))&reference=eq.' + encodeURIComponent(reference)
  );
  return rows && rows[0];
}

function fetchAppSettings() {
  var rows = supabaseGet('/rest/v1/app_settings?select=*&id=eq.1');
  return (rows && rows[0]) || {};
}

function markEmailSent(id) {
  UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/registrations?id=eq.' + id, {
    method: 'patch',
    contentType: 'application/json',
    headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, Prefer: 'return=minimal' },
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
    adminEmail: t.adminEmail || '',
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
    date: event.event_date ? Utilities.formatDate(new Date(event.event_date), Session.getScriptTimeZone(), 'EEEE d MMMM yyyy') : 'To be announced',
    time: [event.start_time, event.end_time].filter(String).join(' - ') || 'To be announced',
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
  var body = renderMerge(template.body, mergeMap) + menuBlock(event, reg);

  var button = '';
  if (template.buttonLabel && template.buttonUrl) {
    button =
      '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto;"><tr><td style="background:#F0B323;border-radius:10px;">' +
      '<a href="' + renderMerge(template.buttonUrl, mergeMap) + '" style="display:inline-block;padding:12px 28px;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;color:#1a3c5e;text-decoration:none;">' +
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
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
