import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { TicketX } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';

export interface RepeatScan {
  reference: string;
  name: string | null;
  checked_in_at: string | null;
  booths?: Array<{ label: string; number: string }> | null;
}

/** "12 minutes ago", "2 hours ago": how long since the first check in. */
export function timeAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return '';
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'less than a minute ago';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** A short low double beep, played through the page's audio context. */
export function playWarningBeep(audio: AudioContext | null) {
  if (!audio) return;
  try {
    void audio.resume();
    [0, 0.28].forEach((offset) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'square';
      osc.frequency.value = 330;
      gain.gain.setValueAtTime(0.18, audio.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + offset + 0.22);
      osc.connect(gain).connect(audio.destination);
      osc.start(audio.currentTime + offset);
      osc.stop(audio.currentTime + offset + 0.24);
    });
  } catch { /* sound is a bonus, never block the alert */ }
}

/**
 * Full screen warning for a QR that was already checked in, e.g. someone
 * coming back for a second gift. It covers the camera so staff cannot miss
 * it, and stays until they tap OK. Drawn at the end of <body> so the rest of
 * the app can be made inert behind it.
 */
export function RepeatScanAlert({ scan, onClose }: { scan: RepeatScan; onClose: () => void }) {
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const app = document.getElementById('root');
    app?.setAttribute('inert', '');
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    okRef.current?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      // OK is the only control, so Tab keeps focus on it.
      if (e.key === 'Tab') { e.preventDefault(); okRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      app?.removeAttribute('inert');
      document.body.style.overflow = prevOverflow;
      if (before && document.contains(before)) before.focus({ preventScroll: true });
    };
  }, [onClose]);

  const booths = scan.booths?.map((b) => b.number || b.label).filter(Boolean).join(', ');

  const alert = (
    <div className="no-print fixed inset-0 z-[70] flex items-center justify-center bg-red-950/70 p-4 backdrop-blur-sm">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="repeat-scan-title"
        aria-describedby="repeat-scan-detail"
        // Fits short and landscape screens: the card scrolls instead of hiding OK.
        className="flex max-h-[calc(100vh-2rem)] max-h-[calc(100dvh-2rem)] w-full max-w-sm flex-col overflow-hidden rounded-3xl bg-white text-center shadow-2xl ring-4 ring-red-500"
      >
        <div className="overflow-y-auto overscroll-contain">
          <div className="bg-red-600 px-6 pb-5 pt-6 text-white">
            <TicketX className="mx-auto h-12 w-12 sm:h-14 sm:w-14" aria-hidden="true" />
            <p id="repeat-scan-title" className="mt-2 font-display text-2xl font-bold leading-tight">Already checked in</p>
            <p className="mt-1 text-sm text-red-100">This QR code has been used before.</p>
          </div>
          <div id="repeat-scan-detail" className="space-y-1 px-6 py-5">
            <p className="break-words text-lg font-semibold text-slate-800">{scan.name ?? 'Unnamed'}</p>
            <p className="break-words font-mono text-sm text-slate-500">{scan.reference}{booths ? ` · Booth ${booths}` : ''}</p>
            {scan.checked_in_at && (
              <p className="pt-2 text-sm text-slate-700">
                First scanned <span className="font-semibold">{formatDateTime(scan.checked_in_at)}</span>
                <br />
                <span className="font-semibold text-red-600">({timeAgo(scan.checked_in_at)})</span>
              </p>
            )}
          </div>
        </div>
        <div className="shrink-0 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-1">
          <button
            ref={okRef}
            type="button"
            onClick={onClose}
            className="min-h-12 w-full rounded-xl bg-slate-900 px-4 text-base font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-300"
          >
            OK, continue scanning
          </button>
        </div>
      </div>
    </div>
  );
  // Server rendering (tests) has no document to attach to.
  return typeof document === 'undefined' ? alert : createPortal(alert, document.body);
}
