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
