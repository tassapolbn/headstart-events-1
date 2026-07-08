/** Translate database error codes into friendly messages for the public form. */
const messages: Record<string, string> = {
  BOOTH_TAKEN: 'Sorry, that booth was just taken by someone else. Please choose another booth.',
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

export function friendlyError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  for (const code of Object.keys(messages)) {
    if (raw.includes(code)) return messages[code];
  }
  return 'Something went wrong while submitting. Please check your connection and try again.';
}
