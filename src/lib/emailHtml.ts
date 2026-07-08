import type { EmailTemplate } from './types';
import { renderMergeFields } from './merge';

/**
 * Build the confirmation email HTML.
 * The Apps Script relay uses the same structure so what you preview
 * in the editor is what the registrant receives.
 */
export function buildEmailHtml(opts: {
  template: EmailTemplate;
  mergeMap: Record<string, string>;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  qrUrl?: string | null;
  schoolName?: string;
}): string {
  const { template, mergeMap, logoUrl, bannerUrl, qrUrl, schoolName } = opts;
  const body = renderMergeFields(template.body, mergeMap);
  const button = template.buttonLabel && template.buttonUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto;"><tr><td style="background:#F0B323;border-radius:10px;">
         <a href="${renderMergeFields(template.buttonUrl, mergeMap)}" style="display:inline-block;padding:12px 28px;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;color:#1a3c5e;text-decoration:none;">${template.buttonLabel}</a>
       </td></tr></table>`
    : '';
  const qr = template.showQr && qrUrl
    ? `<div style="text-align:center;margin:24px 0;">
         <img src="${qrUrl}" alt="Check in QR code" width="150" height="150" style="border:1px solid #e2e8f0;border-radius:8px;"/>
         <p style="font-family:Arial,sans-serif;font-size:12px;color:#64748b;margin-top:8px;">Show this QR code at the event for check in.</p>
       </div>`
    : '';

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f1f5f9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;">
        <tr>
          <td style="background:#1a3c5e;padding:20px 32px;text-align:center;">
            ${template.showLogo && logoUrl ? `<img src="${logoUrl}" alt="School logo" height="52" style="height:52px;max-width:180px;object-fit:contain;"/>` : ''}
            <p style="font-family:Arial,sans-serif;color:#ffffff;font-size:18px;font-weight:bold;margin:8px 0 0;">${schoolName ?? 'HeadStart International School Phuket'}</p>
          </td>
        </tr>
        ${template.showBanner && bannerUrl ? `<tr><td><img src="${bannerUrl}" alt="" width="600" style="width:100%;display:block;"/></td></tr>` : ''}
        <tr>
          <td style="padding:32px;font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:#14202e;">
            ${body}
            ${button}
            ${qr}
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;padding:16px 32px;text-align:center;">
            <p style="font-family:Arial,sans-serif;font-size:11px;color:#94a3b8;margin:0;">
              This email was sent automatically by HeadStart Events. Please do not reply to this message.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
