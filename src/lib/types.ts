// Shared domain types for the HeadStart Events platform.

export type EventStatus = 'draft' | 'published' | 'open' | 'closed' | 'waitlist';

export type FieldType =
  | 'short_text' | 'paragraph' | 'email' | 'phone' | 'number' | 'date' | 'time'
  | 'rating' | 'evaluation' | 'dropdown' | 'radio' | 'checkboxes' | 'multiple_choice' | 'menu_quantity'
  | 'grid' | 'checkbox_grid' | 'ranking'
  | 'file' | 'photo' | 'signature' | 'rich_text' | 'divider' | 'heading';

export interface FieldCondition {
  fieldId: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'answered';
  value?: string;
}

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  helpText?: string;
  required?: boolean;
  options?: string[];
  allowOther?: boolean;
  validation?: {
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
  };
  condition?: FieldCondition;
  /** Static content for heading / rich_text blocks */
  content?: string;
  accept?: string;
  maxSizeMB?: number;
  /** Number fields: also collect the names, one per line */
  collectNames?: boolean;
  /** Grid questions: the row labels (options hold the column labels). Ranking: options hold the items. */
  rows?: string[];
  /** Multiple choice grid: each column may be chosen in one row only (e.g. 1st, 2nd, 3rd) */
  onePerColumn?: boolean;
  /** Rating: how each point is shown */
  ratingIcon?: 'number' | 'star' | 'heart' | 'thumb';
  /** Rating: optional words under the lowest and highest point */
  lowLabel?: string;
  highLabel?: string;
  /** Checkboxes / multiple choice: the wording of the extra "Other" choice */
  otherLabel?: string;
  /** Copies this answer into the registration columns used for search and email */
  mapTo?: 'name' | 'email' | 'phone' | null;
}

export const POLICY_ACK_KEY = '__policy_acks';
export interface PolicyAck {
  id: string;
  title: string;
  text: string;
  accepted_at: string;
}

export interface PolicySection {
  requireAck?: boolean;
  requireRead?: boolean;
  ackText?: string;
  id: string;
  title: string;
  content: string;
  enabled: boolean;
  /** Optional infographic shown with this section */
  image_url?: string;
}

export interface EventBranding {
  /** Hide the floating logo (when the banner artwork already includes it) */
  hide_logo?: boolean;
  poster_url?: string;
  banner_url?: string;
  header_url?: string;
  logo_url?: string;
  background_url?: string;
}

export interface EventTheme {
  /** Optional public page composition. Stored in the existing theme JSON. */
  pageWidth?: number;
  titleAlign?: 'left' | 'center';
  bannerHeight?: number;
  bannerFit?: 'cover' | 'contain';
  bannerPosition?: number;
  posterWidth?: number;
  logoHeight?: number;
  backgroundOpacity?: number;
  showEventDetails?: boolean;
  primary: string;
  secondary: string;
  accent: string;
  /** Event name colour (falls back to primary) */
  titleColor?: string;
  /**
   * Outline around the event name.
   * 'auto' (the default) draws it only when the name would not read against
   * the page, 'always' keeps it whatever the colours are, 'never' drops it.
   */
  titleOutlineMode?: 'auto' | 'always' | 'never';
  /** Outline colour. Empty or missing picks the one that suits the page. */
  titleOutlineColor?: string;
  /** Question and section heading colour (falls back to primary) */
  headingColor?: string;
  background: string;
  /** Optional second colour: the page background becomes a gradient */
  backgroundTo?: string;
  card: string;
  text: string;
  font: string;
  headingFont: string;
  radius: number;
  buttonStyle: 'solid' | 'outline' | 'pill';
  animations: boolean;
  preset?: string;
  /**
   * Public form layout.
   * 'flat'  = every question shares the one form card (the original look).
   * 'card'  = each question sits in its own box, like Google Forms.
   */
  questionLayout?: 'flat' | 'card';
  /** Space between questions, in px */
  questionGap?: number;
  /** Question label size, in px */
  questionSize?: number;
  /** Question label weight */
  questionWeight?: 500 | 600 | 700;
  /** Question label font. Empty or missing follows the body font. */
  questionFont?: string;
}

/** Layout defaults, kept in one place so the renderer and the editor agree. */
export const QUESTION_LAYOUT_DEFAULTS = {
  questionLayout: 'flat' as const,
  questionGap: 20,
  questionSize: 14,
  questionWeight: 600 as const,
  questionFont: '',
};

export interface EmailTemplate {
  enabled: boolean;
  subject: string;
  body: string;
  showLogo: boolean;
  showBanner: boolean;
  showQr: boolean;
  attachCalendar: boolean;
  buttonLabel?: string;
  buttonUrl?: string;
  adminNotify: boolean;
  adminEmail?: string;
  adminEmails?: string[];
}

/** What the public page is for. Stored inside events.settings (JSON), so no column change is needed. */
export type FormType = 'registration' | 'survey';

export interface EventSettings {
  /** 'registration' = event sign up (reference, QR, booths). 'survey' = survey, questionnaire or feedback form. */
  formType: FormType;
  /** Optional custom heading above the form (falls back to the wording for the form type) */
  formHeading?: string;
  introText?: string;
  footerText?: string;
  /** Optional custom submit button label (falls back to the wording for the form type) */
  submitLabel?: string;
  /** How many booths one registration may hold (1 to 3) */
  maxBooths: number;
  allowDuplicateEmail: boolean;
  requireApproval: boolean;
  waitlistEnabled: boolean;
  minSubmitSeconds: number;
  requirePolicyAck: boolean;
  policyAckText: string;
  confirmationMessage: string;
  /** Show the QR code on the confirmation page */
  showQrOnSuccess: boolean;
  boothSelection: 'none' | 'single';
  boothSelectionLabel: string;
}

export interface FloorPlanSettings {
  enabled: boolean;
  width: number;
  height: number;
  orientation: 'landscape' | 'portrait';
  background_url?: string;
  showGrid: boolean;
  gridSize: number;
  /** Form field whose answer is displayed on booked booths (e.g. Country) */
  bookedLabelField?: string;
  /** Form field that determines the vendor type (e.g. Outside Provider) */
  vendorTypeField?: string;
  /** Note shown to registrants above the floor plan, e.g. power availability */
  note?: string;
  /** vendor type answer -> allowed booth group names (empty = anywhere) */
  zoneMap?: Record<string, string[]>;
}

export type BoothStatus =
  | 'available' | 'reserved' | 'booked' | 'disabled' | 'sponsor' | 'vip'
  | 'food_zone' | 'activity_zone' | 'stage' | 'info_desk' | 'toilet'
  | 'emergency_exit' | 'entrance';

export interface Booth {
  id: string;
  event_id: string;
  label: string;
  number: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  color: string | null;
  status: BoothStatus;
  hidden: boolean;
  group_name: string | null;
  notes: string | null;
  /** Public label shown while booked, e.g. the country name */
  booked_label: string | null;
  /** Optional fixed font size for the booth text on the plan */
  font_size?: number | null;
  /** Vendor types allowed to select this booth (null or empty = everyone) */
  allowed_types?: string[] | null;
}

export interface Campus {
  id: string;
  name: string;
  school_name: string;
  logo_url: string | null;
  email_logo_url: string | null;
  webhook_url: string | null;
  notify_emails: string[];
  accent: string;
  sort_order: number;
}

export interface EventRecord {
  id: string;
  campus_id: string;
  slug: string;
  name: string;
  description: string;
  event_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string;
  reg_opens_at: string | null;
  reg_closes_at: string | null;
  max_registrations: number | null;
  status: EventStatus;
  branding: EventBranding;
  theme: EventTheme;
  form_schema: FormField[];
  policies: PolicySection[];
  email_template: EmailTemplate;
  settings: EventSettings;
  floor_plan: FloorPlanSettings;
  created_at: string;
  updated_at: string;
}

export type RegistrationStatus = 'pending' | 'confirmed' | 'waitlist' | 'rejected' | 'cancelled';

export interface Registration {
  id: string;
  event_id: string;
  reference: string;
  booth_id: string | null;
  status: RegistrationStatus;
  name: string | null;
  email: string | null;
  phone: string | null;
  data: Record<string, unknown>;
  checked_in_at: string | null;
  email_sent_at: string | null;
  created_at: string;
  updated_at: string;
  booths?: { label: string; number: string } | null;
  registration_booths?: Array<{ booth_id?: string; booths: { label: string; number: string } | null }>;
}

export interface EventTemplateRecord {
  id: string;
  name: string;
  description: string;
  snapshot: TemplateSnapshot;
  campus_id: string | null;
  created_at: string;
}

export interface TemplateSnapshot {
  event: Partial<EventRecord>;
  booths: Array<Omit<Booth, 'id' | 'event_id'>>;
}

export interface AppSettings {
  id: number;
  school_name: string;
  logo_url: string | null;
  /** White version of the logo for the dark email header */
  email_logo_url: string | null;
  admin_email: string | null;
  webhook_url: string | null;
}

export interface EventTemplateRecordCampus {
  campus_id?: string | null;
}

export interface SubmitResult {
  id: string;
  reference: string;
  status: RegistrationStatus;
  booth_label: string | null;
  booth_number: string | null;
}
