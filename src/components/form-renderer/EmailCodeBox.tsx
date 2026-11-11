import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, MailCheck } from 'lucide-react';
import { Spinner } from '@/components/ui/basics';
import { cn } from '@/lib/utils';
import { looksLikeEmail, type EmailCheck } from './emailCode';

/** The database allows one code a minute per address. */
const RESEND_SECONDS = 60;

const codeErrors: Record<string, string> = {
  wrong: 'That code is not right. Please check the newest email from us and try again.',
  locked: 'Too many wrong tries for this code. Please send a new code.',
  expired: 'This code has expired. Please send a new code.',
};

const buttonCls =
  'inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';

function messageOf(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'Something went wrong. Please try again.';
}

/**
 * Under the email question: send a 6-digit code to the address, then type it
 * in. Once it matches, the address is confirmed and the form can be sent, so
 * a mistyped address is caught before it is saved.
 */
export function EmailCodeBox({ id, email, check, confirmed, attention, onConfirmed, onSent, inputClassName }: {
  id: string;
  /** The address as typed, trimmed and lower case ('' when empty). */
  email: string;
  check: EmailCheck;
  confirmed: boolean;
  /** The form could not go on because the address is not confirmed yet. */
  attention: boolean;
  onConfirmed: (email: string, token: string) => void;
  /** A code is on its way, so the earlier reminder has been acted on. */
  onSent?: () => void;
  inputClassName: string;
}) {
  const [sentTo, setSentTo] = useState('');
  const [sentAt, setSentAt] = useState(0);
  const [now, setNow] = useState(0);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'send' | 'check' | null>(null);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const valid = looksLikeEmail(email);
  // A code is on its way to the address in the box.
  const waiting = valid && sentTo === email;
  const wait = Math.max(0, Math.ceil((sentAt + RESEND_SECONDS * 1000 - now) / 1000));
  const counting = waiting && wait > 0;

  useEffect(() => {
    if (!counting) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [counting]);

  // A different address starts afresh.
  useEffect(() => { setMessage(null); setCode(''); }, [email]);

  // Ready to type as soon as the code is on its way.
  useEffect(() => { if (sentAt) codeRef.current?.focus(); }, [sentAt]);

  function markSent() {
    const t = Date.now();
    setSentTo(email);
    setSentAt(t);
    setNow(t);
    setCode('');
    onSent?.();
  }

  async function send() {
    if (!valid || busy) return;
    setBusy('send');
    setMessage(null);
    try {
      await check.send(email);
      markSent();
    } catch (err) {
      // A code sent moments ago is still good: let them type it in.
      const pending = !!(err as { pending?: boolean } | null)?.pending;
      if (pending) markSent();
      setMessage({ error: !pending, text: messageOf(err) });
    } finally {
      setBusy(null);
    }
  }

  async function confirm(value = code) {
    if (value.length !== 6 || busy) return;
    setBusy('check');
    setMessage(null);
    try {
      const result = await check.confirm(email, value);
      if ('token' in result && result.token) {
        onConfirmed(email, result.token);
        return;
      }
      setMessage({ error: true, text: codeErrors['error' in result ? result.error : 'wrong'] ?? codeErrors.wrong });
      setCode('');
      codeRef.current?.focus();
    } catch (err) {
      setMessage({ error: true, text: messageOf(err) });
    } finally {
      setBusy(null);
    }
  }

  if (confirmed) {
    return (
      <p id={id} role="status" className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Email confirmed:</span>{' '}
        <span className="break-words font-semibold">{email}</span>
      </p>
    );
  }

  const primary = { background: 'var(--ev-primary, #1a3c5e)' };
  return (
    <div
      id={id} role="group" aria-labelledby={`${id}-title`}
      className={cn('mt-3 space-y-2.5 rounded-xl border bg-white/70 p-3 sm:p-4', attention ? 'border-red-400 ring-2 ring-red-100' : 'border-slate-200')}
    >
      <p id={`${id}-title`} className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--ev-heading, #142e49)' }}>
        <MailCheck className="h-4 w-4 shrink-0" aria-hidden="true" /> Confirm your email address
      </p>
      <p className="text-xs opacity-80">
        {!valid
          ? 'Type your email above, then we will send you a 6-digit code to make sure it is correct.'
          : waiting
            ? <>We sent a 6-digit code to <strong className="break-words">{email}</strong>. It can take a minute to arrive. Please check Junk or Spam too.</>
            : <>We will send a 6-digit code to <strong className="break-words">{email}</strong> to make sure it is correct.</>}
      </p>

      {waiting ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={`${id}-input`} className="sr-only">6-digit code</label>
            <div className="w-44 shrink-0">
              <input
                ref={codeRef} id={`${id}-input`} type="text" inputMode="numeric" autoComplete="one-time-code"
                pattern="[0-9]*" maxLength={6} placeholder="6-digit code"
                className={cn(inputClassName, 'text-center font-mono text-lg tracking-[0.25em] placeholder:font-sans placeholder:text-sm placeholder:tracking-normal')}
                value={code} readOnly={busy === 'check'}
                aria-invalid={!!message?.error} aria-describedby={`${id}-msg`}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setCode(digits);
                  // Six digits are a whole code: check it straight away.
                  if (digits.length === 6) void confirm(digits);
                }}
                onKeyDown={(e) => {
                  // Enter checks the code instead of sending the form.
                  if (e.key === 'Enter') { e.preventDefault(); void confirm(); }
                }}
              />
            </div>
            <button type="button" className={buttonCls} style={primary} disabled={code.length !== 6 || !!busy} onClick={() => void confirm()}>
              {busy === 'check' && <Spinner size={14} />} Confirm
            </button>
          </div>
          <button
            type="button" disabled={counting || !!busy} onClick={() => void send()}
            className="text-xs font-semibold underline underline-offset-2 disabled:cursor-not-allowed disabled:no-underline disabled:opacity-60"
            style={{ color: 'var(--ev-primary, #1a3c5e)' }}
          >
            {busy === 'send' ? 'Sending a new code…' : counting ? `Send a new code in ${wait}s` : 'Send a new code'}
          </button>
        </div>
      ) : (
        <button type="button" className={buttonCls} style={primary} disabled={!valid || !!busy} onClick={() => void send()}>
          {busy === 'send' && <Spinner size={14} />} Send code
        </button>
      )}

      <div id={`${id}-msg`} aria-live="polite">
        {message
          ? <p role={message.error ? 'alert' : undefined} className={cn('text-xs font-medium', message.error ? 'text-red-600' : 'opacity-80')}>{message.text}</p>
          : attention && <p role="alert" className="text-xs font-medium text-red-600">Please confirm your email address before you continue.</p>}
      </div>
    </div>
  );
}
