import type { EventRecord, FormType } from './types';

/**
 * Public and admin wording for each form type.
 * Surveys use neutral wording only: no "register" anywhere the public can see.
 */
export interface FormCopy {
  isSurvey: boolean;
  typeLabel: string;
  skipLink: string;
  scrollCue: string;
  formHeading: string;
  submitLabel: string;
  notOpenTitle: string;
  closedTitle: string;
  opensOn: (date: string) => string;
  closedHint: string;
  successTitle: string;
  successPending: string;
  successWaitlist: string;
  homeBadge: string;
  shareText: (name: string, url: string) => string;
  /** Admin wording */
  entries: string;
  entry: string;
  countLabel: (n: number) => string;
  windowCard: string;
  opensLabel: string;
  closesLabel: string;
  maxLabel: string;
  behaviourCard: string;
  emailCard: string;
  emailSwitch: string;
  notifySwitch: string;
}

const registration: FormCopy = {
  isSurvey: false,
  typeLabel: 'Event registration',
  skipLink: 'Skip to the registration form',
  scrollCue: 'Register below',
  formHeading: 'Registration form',
  submitLabel: 'Submit registration',
  notOpenTitle: 'Registration has not opened yet',
  closedTitle: 'Registration is closed',
  opensOn: (d) => `Registration opens on ${d}.`,
  closedHint: 'Thank you for your interest in this event.',
  successTitle: 'Registration confirmed!',
  successPending: 'Registration received',
  successWaitlist: 'You are on the waitlist',
  homeBadge: 'Register now',
  shareText: (name, url) => `${name} - register here: ${url}`,
  entries: 'Registrations',
  entry: 'Registration',
  countLabel: (n) => `${n} registered`,
  windowCard: 'Registration window and capacity',
  opensLabel: 'Registration opens',
  closesLabel: 'Registration closes',
  maxLabel: 'Maximum registrations',
  behaviourCard: 'Registration behaviour',
  emailCard: 'Confirmation email',
  emailSwitch: 'Send a confirmation email after each registration',
  notifySwitch: 'Notify the administrator about each registration',
};

const survey: FormCopy = {
  isSurvey: true,
  typeLabel: 'Survey / Feedback',
  skipLink: 'Skip to the form',
  scrollCue: 'Start below',
  formHeading: 'Your responses',
  submitLabel: 'Submit',
  notOpenTitle: 'This form is not open yet',
  closedTitle: 'This form is now closed',
  opensOn: (d) => `This form opens on ${d}.`,
  closedHint: 'Thank you for your interest. Responses are no longer being accepted.',
  successTitle: 'Thank you!',
  successPending: 'Thank you!',
  successWaitlist: 'Thank you!',
  homeBadge: 'Open now',
  shareText: (name, url) => `${name}: ${url}`,
  entries: 'Responses',
  entry: 'Response',
  countLabel: (n) => `${n} ${n === 1 ? 'response' : 'responses'}`,
  windowCard: 'Response window and limit',
  opensLabel: 'Form opens',
  closesLabel: 'Form closes',
  maxLabel: 'Maximum responses',
  behaviourCard: 'Response behaviour',
  emailCard: 'Thank you email',
  emailSwitch: 'Send a thank you email after each response',
  notifySwitch: 'Notify the administrator about each response',
};

export function formTypeOf(event?: Pick<EventRecord, 'settings'> | null): FormType {
  return event?.settings?.formType === 'survey' ? 'survey' : 'registration';
}

export function formCopy(event?: Pick<EventRecord, 'settings'> | null): FormCopy {
  return formTypeOf(event) === 'survey' ? survey : registration;
}

export function copyForType(type: FormType): FormCopy {
  return type === 'survey' ? survey : registration;
}
