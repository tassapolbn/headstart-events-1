import type { EmailCheck, EmailCodeResult } from '@/components/form-renderer/emailCode';
import { friendlyError, messageOf } from './errors';

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;

/** How long to wait for the relay's answer before assuming the code is on its way. */
const RELAY_WAIT_MS = 20000;

/** The relay's reasons for not sending a code, in words people can act on. */
export function relayCodeError(reason: string): string {
  if (/missing reference/i.test(reason)) {
    return 'ADMIN: the email relay (Apps Script) is an older version and cannot send codes yet. Please paste the latest EmailRelay.gs and deploy a new version.';
  }
  if (/too many times|quota|limit/i.test(reason)) {
    return 'The school has reached today’s email limit, so the code could not be sent. Please try again tomorrow or contact the school office.';
  }
  if (/invalid email/i.test(reason)) return 'That email address cannot receive email. Please check it and try again.';
  if (/expired/i.test(reason)) return 'That code expired before it could be sent. Please send a new code.';
  if (/not found/i.test(reason)) {
    return 'ADMIN: the email relay could not find the code. Check that the relay uses the same Supabase project as this website.';
  }
  return `The code could not be sent. Please try again in a moment. Technical detail: ${reason.slice(0, 120)}`;
}

/**
 * Ask the relay to email the code. Resolves when it was sent, and also when
 * its answer cannot be read: the request still reached the relay.
 */
async function relaySend(relayUrl: string, requestId: string, fetchImpl: typeof fetch): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RELAY_WAIT_MS);
  let reply: { ok?: boolean; error?: unknown } | null;
  try {
    const res = await fetchImpl(relayUrl, {
      method: 'POST',
      // Plain text keeps this a simple request, as Apps Script expects.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'send_code', requestId }),
      signal: controller.signal,
    });
    reply = await res.json();
  } catch {
    return;
  } finally {
    clearTimeout(timer);
  }
  if (reply && reply.ok === false) throw new Error(relayCodeError(String(reply.error ?? '')));
}

/** "Confirm email with a 6-digit code" for one form, through the database and the email relay. */
export function makeEmailCheck({ rpc, eventId, relayUrl, kind, resetKey, fetchImpl = (...args) => fetch(...args) }: {
  rpc: Rpc;
  eventId: string;
  relayUrl: string;
  kind: 'registration' | 'survey';
  resetKey?: number;
  fetchImpl?: typeof fetch;
}): EmailCheck {
  return {
    resetKey,
    async send(email) {
      // Without the relay a code could never arrive, so do not create one.
      if (!relayUrl) throw new Error('ADMIN: add the email relay URL in Settings so confirmation codes can be sent.');
      const { data, error } = await rpc('request_email_code', { p_event_id: eventId, p_email: email });
      if (error) {
        const err = new Error(friendlyError(error, kind)) as Error & { pending?: boolean };
        err.pending = messageOf(error).includes('EMAIL_CODE_TOO_SOON');
        throw err;
      }
      if (typeof data !== 'string' || !data) throw new Error('The code could not be prepared. Please try again.');
      await relaySend(relayUrl, data, fetchImpl);
    },
    async confirm(email, code) {
      const { data, error } = await rpc('check_email_code', { p_event_id: eventId, p_email: email, p_code: code });
      if (error) throw new Error(friendlyError(error, kind));
      const result = data as EmailCodeResult | null;
      if (!result || typeof result !== 'object' || !('token' in result || 'error' in result)) {
        throw new Error('The code could not be checked. Please try again.');
      }
      return result;
    },
  };
}
