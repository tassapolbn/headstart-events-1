/** Translate database error codes into friendly messages for the public form. */
const messages: Record<string, string> = {
  BOOTH_TAKEN: 'Sorry, that booth was just taken by someone else. Please choose another booth.',
  BOOTH_NOT_ALLOWED: 'That booth is reserved for a different vendor type. Please choose one of the booths available to you.',
  TOO_MANY_BOOTHS: 'You have selected more booths than allowed for this event.',
  EVENT_FULL: 'This event has reached its maximum number of registrations.',
  REGISTRATION_CLOSED: 'Registration for this event has closed.',
  REGISTRATION_NOT_OPEN: 'Registration for this event has not opened yet.',
  DUPLICATE_EMAIL: 'This email address has already been used to register for this event.',
  INVALID_EMAIL: 'Please enter a valid email address.',
  POLICY_NOT_ACKNOWLEDGED: 'Please read and accept the event policies before submitting.',
  SPAM_DETECTED: 'Your submission could not be processed. Please try again.',
  EVENT_NOT_FOUND: 'This event could not be found or is not accepting registrations.',
  NOT_FOUND: 'No registration was found for that reference.',
};

/** Extract a readable message from any error shape Supabase can produce. */
function messageOf(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object') {
    const e = error as Record<string, unknown>;
    for (const key of ['message', 'error_description', 'details', 'hint', 'error', 'msg']) {
      const v = e[key];
      if (typeof v === 'string' && v.trim()) return v;
    }
    try {
      return JSON.stringify(error).slice(0, 300);
    } catch {
      return 'Unknown error';
    }
  }
  return String(error);
}

export function friendlyError(error: unknown): string {
  const raw = messageOf(error);
  for (const code of Object.keys(messages)) {
    if (raw.includes(code)) return messages[code];
  }
  // Infrastructure level causes, phrased for the administrator.
  if (raw.includes('Could not find the function') || raw.includes('schema cache')) {
    return 'ADMIN: the website is newer than the database. Please run the latest migration file(s) in the Supabase SQL Editor.';
  }
  if (raw.includes('Bucket not found')) {
    return 'ADMIN: the storage bucket is missing. Please run supabase/schema.sql storage section in the SQL Editor.';
  }
  if (raw.toLowerCase().includes('row-level security')) {
    return 'ADMIN: a database permission rule blocked this action. Please re-run the latest migration file in Supabase.';
  }
  if (raw.includes('Failed to fetch')) {
    return 'Could not reach the server. Please check your internet connection and try again.';
  }
  return `Something went wrong while submitting. Technical detail: ${raw.slice(0, 160)}`;
}
