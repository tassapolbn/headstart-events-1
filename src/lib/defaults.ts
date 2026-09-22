import type {
  EmailTemplate, EventRecord, EventSettings, EventTheme,
  FloorPlanSettings, FormField, FormType, PolicySection,
} from './types';
import { QUESTION_LAYOUT_DEFAULTS } from './types';
import { uid } from './utils';

// ------------------------------------------------------------------
// HeadStart brand
// ------------------------------------------------------------------
export const BRAND = {
  navy: '#1a3c5e',
  gold: '#F0B323',
  white: '#FFFFFF',
  schoolName: 'HeadStart International School Phuket',
};

export const defaultTheme: EventTheme = {
  primary: BRAND.navy,
  secondary: BRAND.gold,
  accent: '#2f5d8a',
  background: '#f4f6fa',
  card: '#ffffff',
  text: '#14202e',
  font: 'Inter',
  headingFont: 'Poppins',
  radius: 14,
  buttonStyle: 'solid',
  animations: true,
  preset: 'headstart',
  ...QUESTION_LAYOUT_DEFAULTS,
};

export interface ThemePreset {
  id: string;
  name: string;
  theme: EventTheme;
}

export const themePresets: ThemePreset[] = [
  { id: 'headstart', name: 'HeadStart Classic', theme: { ...defaultTheme } },
  {
    id: 'christmas', name: 'Christmas',
    theme: { ...defaultTheme, primary: '#B3000C', secondary: '#1E5631', accent: '#F0B323', background: '#fdf6f0', headingFont: 'Playfair Display', preset: 'christmas' },
  },
  {
    id: 'halloween', name: 'Halloween',
    theme: { ...defaultTheme, primary: '#5b21b6', secondary: '#f97316', accent: '#111827', background: '#f6f2fb', headingFont: 'Poppins', preset: 'halloween' },
  },
  {
    id: 'international_day', name: 'International Day',
    theme: { ...defaultTheme, primary: '#0e7490', secondary: '#f59e0b', accent: '#dc2626', background: '#f0fbfd', preset: 'international_day' },
  },
  {
    id: 'graduation', name: 'Graduation',
    theme: { ...defaultTheme, primary: '#1a3c5e', secondary: '#F0B323', accent: '#6b7280', background: '#f8f7f2', headingFont: 'Playfair Display', buttonStyle: 'pill', preset: 'graduation' },
  },
  {
    id: 'friday_market', name: 'Friday Market',
    theme: { ...defaultTheme, primary: '#15803d', secondary: '#F0B323', accent: '#b45309', background: '#f3faf4', preset: 'friday_market' },
  },
];

export const fontOptions = ['Inter', 'Poppins', 'Nunito', 'Playfair Display', 'Merriweather', 'Quicksand'];

// ------------------------------------------------------------------
// Event defaults
// ------------------------------------------------------------------
export const defaultSettings: EventSettings = {
  formType: 'registration',
  maxBooths: 1,
  allowDuplicateEmail: false,
  requireApproval: false,
  waitlistEnabled: true,
  minSubmitSeconds: 3,
  requirePolicyAck: true,
  policyAckText: 'I have read and understood the event policies and agree to comply with them.',
  confirmationMessage: 'Thank you for registering. We look forward to seeing you at the event.',
  showQrOnSuccess: true,
  boothSelection: 'none',
  boothSelectionLabel: 'Select your booth',
};

export const defaultFloorPlan: FloorPlanSettings = {
  enabled: false,
  width: 1600,
  height: 1000,
  orientation: 'landscape',
  showGrid: true,
  gridSize: 20,
  bookedLabelField: '',
  note: '',
};

export const defaultEmailTemplate: EmailTemplate = {
  enabled: true,
  subject: 'Registration confirmed: {{Event}}',
  body: [
    '<p>Dear Khun {{Name}},</p>',
    '<p>Thank you for registering for <strong>{{Event}}</strong>. Your registration has been received.</p>',
    '<p><strong>Reference:</strong> {{ReferenceNumber}}<br/>',
    '<strong>Booth:</strong> {{Booth}}<br/>',
    '<strong>Date:</strong> {{Date}}<br/>',
    '<strong>Time:</strong> {{Time}}<br/>',
    '<strong>Location:</strong> {{Location}}</p>',
    '<p>Please keep this email. The QR code below will be used for check in on the day.</p>',
    '<p>Warm regards,<br/>Events Team<br/>HeadStart International School Phuket</p>',
  ].join('\n'),
  showLogo: true,
  showBanner: false,
  showQr: true,
  attachCalendar: true,
  adminNotify: true,
  adminEmail: '',
};

/** Thank you email for surveys: no reference number, booth, QR code or calendar file. */
export const surveyEmailTemplate: EmailTemplate = {
  enabled: true,
  subject: 'Thank you for your response: {{Event}}',
  body: [
    '<p>Dear Khun {{Name}},</p>',
    '<p>Thank you for taking the time to complete <strong>{{Event}}</strong>. Your response has been received.</p>',
    '<p>We truly appreciate your feedback. It helps us continue to improve our school community.</p>',
    '<p>Warm regards,<br/>HeadStart International School Phuket</p>',
  ].join('\n'),
  showLogo: true,
  showBanner: false,
  showQr: false,
  attachCalendar: false,
  adminNotify: true,
  adminEmail: '',
};

/** Settings suited to a survey, questionnaire or feedback form. */
export const surveySettingsPatch: Partial<EventSettings> = {
  formType: 'survey',
  allowDuplicateEmail: true,
  requireApproval: false,
  waitlistEnabled: false,
  requirePolicyAck: false,
  showQrOnSuccess: false,
  boothSelection: 'none',
  confirmationMessage: 'Thank you for taking the time to share your views. Your response has been received.',
};

/** Settings restored when a form is switched back to event registration. */
export const registrationSettingsPatch: Partial<EventSettings> = {
  formType: 'registration',
  allowDuplicateEmail: defaultSettings.allowDuplicateEmail,
  waitlistEnabled: defaultSettings.waitlistEnabled,
  requirePolicyAck: defaultSettings.requirePolicyAck,
  showQrOnSuccess: defaultSettings.showQrOnSuccess,
  confirmationMessage: defaultSettings.confirmationMessage,
};

export function defaultEmailFor(type: FormType): EmailTemplate {
  return { ...(type === 'survey' ? surveyEmailTemplate : defaultEmailTemplate) };
}

export const defaultPolicies: PolicySection[] = [
  { id: uid(), title: 'Rules', content: 'All participants must follow the instructions of school staff at all times.', enabled: true },
  { id: uid(), title: 'Health and Safety', content: 'Please report any accident or hazard to the Information Desk immediately.', enabled: true },
  { id: uid(), title: 'Safeguarding', content: 'All visitors must sign in at reception and wear a visitor badge while on campus.', enabled: true },
];

export function newEventDraft(
  name: string, slug: string, campusId = 'hsc', formType: FormType = 'registration',
): Omit<EventRecord, 'id' | 'created_at' | 'updated_at'> {
  const survey = formType === 'survey';
  return {
    campus_id: campusId,
    slug,
    name,
    description: '',
    event_date: null,
    end_date: null,
    start_time: null,
    end_time: null,
    location: '',
    reg_opens_at: null,
    reg_closes_at: null,
    max_registrations: null,
    status: 'draft',
    branding: {},
    theme: { ...defaultTheme },
    form_schema: survey ? surveyFormPreset() : basicFormPreset(),
    policies: survey ? [] : defaultPolicies.map((p) => ({ ...p, id: uid() })),
    email_template: defaultEmailFor(formType),
    settings: survey ? { ...defaultSettings, ...surveySettingsPatch } : { ...defaultSettings },
    floor_plan: { ...defaultFloorPlan },
  };
}

// ------------------------------------------------------------------
// Form presets
// ------------------------------------------------------------------
export function basicFormPreset(): FormField[] {
  return [
    { id: uid(), type: 'short_text', label: 'Full Name', required: true, mapTo: 'name', placeholder: 'Your full name' },
    { id: uid(), type: 'email', label: 'Email Address', required: true, mapTo: 'email', placeholder: 'name@example.com' },
    { id: uid(), type: 'phone', label: 'Phone Number', required: false, mapTo: 'phone', placeholder: '08x xxx xxxx' },
  ];
}

/** Starter questions for a survey, questionnaire or feedback form. Name and email are optional. */
export function surveyFormPreset(): FormField[] {
  return [
    { id: uid(), type: 'short_text', label: 'Your Name', required: false, mapTo: 'name', placeholder: 'Optional' },
    {
      id: uid(), type: 'email', label: 'Email Address', required: false, mapTo: 'email', placeholder: 'name@example.com',
      helpText: 'Optional. Add your email if you would like to receive a thank you email.',
    },
    { id: uid(), type: 'divider', label: 'Divider' },
    {
      id: uid(), type: 'rating', label: 'Overall, how satisfied are you?', required: true,
      options: ['1', '2', '3', '4', '5'], helpText: '1 = Very dissatisfied, 5 = Very satisfied',
    },
    {
      id: uid(), type: 'evaluation', label: 'How would you rate the organisation?', required: true,
      options: ['Needs improvement', 'Fair', 'Good', 'Very good'],
    },
    { id: uid(), type: 'paragraph', label: 'What did you enjoy most?', required: false },
    { id: uid(), type: 'paragraph', label: 'Any suggestions for improvement?', required: false },
  ];
}

export function vendorFormPreset(): FormField[] {
  return [
    { id: uid(), type: 'heading', label: 'Vendor Information', content: 'Vendor Information' },
    { id: uid(), type: 'short_text', label: 'Vendor Name', required: true, placeholder: 'Stall or business name' },
    { id: uid(), type: 'short_text', label: 'Contact Name', required: true, mapTo: 'name' },
    { id: uid(), type: 'email', label: 'Email Address', required: true, mapTo: 'email' },
    { id: uid(), type: 'phone', label: 'Phone Number', required: true, mapTo: 'phone' },
    { id: uid(), type: 'divider', label: 'Divider' },
    { id: uid(), type: 'heading', label: 'Stall Details', content: 'Stall Details' },
    { id: uid(), type: 'dropdown', label: 'Food Type', options: ['Not selling food', 'Hot food', 'Snacks and desserts', 'Drinks', 'Packaged food'], required: true },
    { id: uid(), type: 'paragraph', label: 'Products Sold', required: true, helpText: 'Describe what you will sell at your stall.' },
    { id: uid(), type: 'number', label: 'Number of Staff', required: true, validation: { min: 1, max: 10 } },
    ...powerQuestions(),
    { id: uid(), type: 'paragraph', label: 'Special Requirements', required: false },
    { id: uid(), type: 'paragraph', label: 'Additional Notes', required: false },
    { id: uid(), type: 'file', label: 'Supporting Documents', required: false, helpText: 'Optional. Menu, licence or product photos.', maxSizeMB: 10 },
  ];
}

export function powerQuestions(): FormField[] {
  const powerId = uid();
  return [
    { id: powerId, type: 'radio', label: 'Power Requirement', options: ['No power needed', 'One socket', 'Two sockets'], required: true },
    {
      id: uid(), type: 'paragraph', label: 'Electrical devices and total watts', required: true,
      placeholder: 'e.g. Rice cooker 700W, blender 400W, small fridge 90W',
      helpText: 'Please list every electrical device you will bring and its power in watts, so we can prepare safe power distribution.',
      condition: { fieldId: powerId, operator: 'not_equals', value: 'No power needed' },
    },
  ];
}

export function countryDropdownPreset(countryNames: string[]): FormField {
  return {
    id: uid(), type: 'dropdown', label: 'Country', required: true,
    helpText: 'Which country will your stall represent?',
    options: countryNames,
  };
}

export const fieldTypeMeta: Record<string, { label: string; group: 'Basic' | 'Selection' | 'Advanced' }> = {
  short_text: { label: 'Short Answer', group: 'Basic' },
  paragraph: { label: 'Paragraph', group: 'Basic' },
  email: { label: 'Email', group: 'Basic' },
  phone: { label: 'Phone Number', group: 'Basic' },
  number: { label: 'Number', group: 'Basic' },
  date: { label: 'Date', group: 'Basic' },
  time: { label: 'Time', group: 'Basic' },
  dropdown: { label: 'Dropdown', group: 'Selection' },
  rating: { label: 'Rating (stars / scale)', group: 'Selection' },
  grid: { label: 'Multiple choice grid', group: 'Selection' },
  checkbox_grid: { label: 'Checkbox grid', group: 'Selection' },
  ranking: { label: 'Ranking (1st, 2nd, 3rd)', group: 'Selection' },
  evaluation: { label: 'Evaluation / Survey', group: 'Selection' },
  radio: { label: 'Radio Buttons', group: 'Selection' },
  checkboxes: { label: 'Checkboxes', group: 'Selection' },
  multiple_choice: { label: 'Multiple Choice', group: 'Selection' },
  menu_quantity: { label: 'Menu with Quantity', group: 'Selection' },
  file: { label: 'File Upload', group: 'Advanced' },
  photo: { label: 'Photo Upload', group: 'Advanced' },
  signature: { label: 'Signature', group: 'Advanced' },
  rich_text: { label: 'Rich Text Block', group: 'Advanced' },
  divider: { label: 'Section Divider', group: 'Advanced' },
  heading: { label: 'Heading', group: 'Advanced' },
};

export const defaultSectionAckText = 'I have read and agree to this policy.';
