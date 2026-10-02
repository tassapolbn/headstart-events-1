import type { EmailTemplate } from './types';
import { renderMergeFields } from './merge';
import { emailDesign } from './emailDesign';

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
  const d = emailDesign(template.design);
  const font = `${d.font},Arial,sans-serif`;
  const header = `<tr><td style="background:${d.headerColor};padding:${d.headerPadding}px 32px;text-align:${d.headerAlign};">${template.showLogo && logoUrl
    ? `<img src="${logoUrl}" alt="School logo" height="${d.logoHeight}" style="height:${d.logoHeight}px;max-width:100%;object-fit:contain;"/>`
    : `<p style="font-family:${font};color:${d.headerTextColor};font-size:18px;font-weight:bold;margin:8px 0 0;">${schoolName ?? 'HeadStart International School Phuket'}</p>`}</td></tr>`;
  const fontLink = d.font === 'Arial' ? '' : `<link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(d.font)}:wght@400;600;700&amp;display=swap" rel="stylesheet">`;
  const body = renderMergeFields(template.body, mergeMap);
  const button = template.buttonLabel && template.buttonUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto;"><tr><td style="background:${d.buttonColor};border-radius:10px;">
         <a href="${renderMergeFields(template.buttonUrl, mergeMap)}" style="display:inline-block;padding:12px 28px;font-family:${font};font-size:14px;font-weight:bold;color:${d.buttonTextColor};text-decoration:none;">${template.buttonLabel}</a>
       </td></tr></table>`
    : '';
  const qr = template.showQr && qrUrl
    ? `<div style="text-align:center;margin:24px 0;">
         <img src="${qrUrl}" alt="Check in QR code" width="150" height="150" style="border:1px solid #e2e8f0;border-radius:8px;"/>
         <p style="font-family:${font};font-size:12px;color:${d.textColor};margin-top:8px;">Show this QR code at the event for check in.</p>
       </div>`
    : '';

  return `<!DOCTYPE html>
<html><head>${fontLink}</head>
<body style="margin:0;padding:0;background:${d.pageColor};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${d.pageColor};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${d.bodyColor};border-radius:16px;overflow:hidden;">
        ${d.headerPosition === 'top' ? header : ''}
        ${template.showBanner && bannerUrl ? `<tr><td><img src="${bannerUrl}" alt="" width="600" style="width:100%;display:block;"/></td></tr>` : ''}
        ${d.headerPosition === 'afterBanner' ? header : ''}
        <tr>
          <td style="padding:32px;font-family:${font};font-size:14px;line-height:1.7;color:${d.textColor};">
            ${body}
            ${button}
            ${qr}
          </td>
        </tr>
        ${d.headerPosition === 'bottom' ? header : ''}
        <tr>
          <td style="background:${d.footerColor};padding:16px 32px;text-align:center;">
            <p style="font-family:${font};font-size:11px;color:${d.footerTextColor};margin:0;">
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
