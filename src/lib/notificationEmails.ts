import type { EmailTemplate } from './types';

// Keep draft entries intact while typing; normalize only when saving or sending.
export function notificationEmailEntries(template?: Partial<EmailTemplate> | null): string[] {
  if (Array.isArray(template?.adminEmails)) return template.adminEmails;
  return (template?.adminEmail ?? '').split(/[,;\n]/);
}

export function normalizeNotificationEmails(entries: string[]): string[] {
  return [...new Set(entries.map((email) => email.trim().toLowerCase()).filter(Boolean))];
}

export function invalidNotificationEmails(entries: string[]): string[] {
  return normalizeNotificationEmails(entries).filter(
    (email) => !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)
  );
}

/**
 * Is there any email for the relay to send for this form?
 *
 * Either one is enough on its own: the confirmation or thank you to the person
 * who submitted, or the notice to the form's own recipients. Turning the
 * confirmation off must not silently stop the staff notice as well, and an
 * anonymous survey response still has someone to tell. The relay itself works
 * out which of the two to send, and reports "no recipients" when neither
 * applies.
 */
export function wantsRelayEmail(template?: Partial<EmailTemplate> | null): boolean {
  return !!(template?.enabled || template?.adminNotify);
}
