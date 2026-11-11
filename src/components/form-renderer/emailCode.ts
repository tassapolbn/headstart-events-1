import type { FormField } from '@/lib/types';
import { isContentField, isVisible } from './fieldZod';

/** "Confirm email with a 6-digit code": what the form needs from the page. */
export interface EmailCheck {
  /**
   * Email a new code to this address. Throws an Error people can read when it
   * cannot; `pending` on the error means a code was sent moments ago.
   */
  send: (email: string) => Promise<void>;
  /** Check a typed code: a one-time token when it is right, otherwise why not. */
  confirm: (email: string, code: string) => Promise<EmailCodeResult>;
  /** A new number forgets earlier confirmations (the database refused one). */
  resetKey?: number;
}

export type EmailCodeResult = { token: string } | { error: 'wrong' | 'locked' | 'expired' };

/** The form the database keeps: trimmed and lower case. */
export function normalEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/** The same rule the database applies before it sends a code. */
export function looksLikeEmail(email: string): boolean {
  return /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email);
}

/**
 * The question whose answer is saved as the registration's email: the first
 * answered question marked as the email, else the first answered email
 * question. Before anything is typed, the question that will be used.
 */
export function registrantEmailField(fields: FormField[], values: Record<string, unknown>): FormField | undefined {
  const shown = fields.filter((f) => !isContentField(f) && isVisible(f, values, fields));
  const answered = (f: FormField) => typeof values[f.id] === 'string' && (values[f.id] as string).trim() !== '';
  return shown.find((f) => f.mapTo === 'email' && answered(f))
    ?? shown.find((f) => f.type === 'email' && answered(f))
    ?? shown.find((f) => f.mapTo === 'email')
    ?? shown.find((f) => f.type === 'email');
}

/** The email address a submission is saved with ('' when there is none). */
export function registrantEmail(fields: FormField[], values: Record<string, unknown>): string {
  const field = registrantEmailField(fields, values);
  return field ? String(values[field.id] ?? '').trim() : '';
}
