// Shared domain types for the HeadStart Events platform.

export type EventStatus = 'draft' | 'published' | 'open' | 'closed' | 'waitlist';

export type FieldType =
  | 'short_text' | 'paragraph' | 'email' | 'phone' | 'number' | 'date' | 'time'
  | 'dropdown' | 'radio' | 'checkboxes' | 'multiple_choice' | 'menu_quantity'
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
  /** Copies this answer into the registration columns used for search and email */
  mapTo?: 'name' | 'email' | 'phone' | null;
}

export interface PolicySection {
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
  primary: string;
  secondary: string;
  accent: string;
  /** Event name colour (falls back to primary) */
  titleColor?: string;
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
}

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
}

export interface EventSettings {
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
