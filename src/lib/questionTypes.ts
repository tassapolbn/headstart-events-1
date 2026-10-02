import type { FieldType, FormField } from './types';
import { gridRows, isGridField } from './grid';

const choices = ['dropdown', 'radio', 'checkboxes', 'multiple_choice', 'evaluation', 'menu_quantity', 'ranking', 'yes_no', 'picture_choice'];
/** Keep identity and presentation, but remove settings incompatible with a new answer shape. */
export function changeQuestionType(field: FormField, type: FieldType): FormField {
  if (type === field.type) return field;
  const next: FormField = { ...field, type, validation: undefined, options: undefined, rows: undefined,
    onePerColumn: undefined, optionImages: undefined, step: undefined, collectNames: undefined, accept: undefined, maxSizeMB: undefined,
    ratingIcon: undefined, lowLabel: undefined, highLabel: undefined, allowOther: undefined, otherLabel: undefined,
    mapTo: ['short_text', 'email', 'phone'].includes(type) ? field.mapTo : null };
  if (choices.includes(type)) next.options = field.options?.length ? [...field.options] : ['Option 1', 'Option 2'];
  if (['grid', 'checkbox_grid'].includes(type)) {
    next.rows = field.rows?.length ? [...field.rows] : ['Row 1', 'Row 2'];
    next.options = field.options?.length ? [...field.options] : ['Column 1', 'Column 2'];
  }
  if (type === 'rating') { next.options = ['1', '2', '3', '4', '5']; next.ratingIcon = 'star'; }
  if (type === 'yes_no' && !field.options?.length) next.options = ['Yes', 'No'];
  if (type === 'picture_choice') next.optionImages = [];
  if (type === 'slider') { next.validation = { min: 0, max: 10 }; next.step = 1; }
  if (['file', 'photo'].includes(type)) next.maxSizeMB = 10;
  return next;
}

/** Older answers must remain visible when their question's input shape changes. */
export function answerFitsQuestion(field: FormField, value: unknown): boolean {
  if (value == null || value === '') return true;
  const object = typeof value === 'object' && !Array.isArray(value);
  if (['file', 'photo', 'signature'].includes(field.type)) return !!object && 'bucket' in value && 'path' in value;
  if (field.type === 'checkboxes') return Array.isArray(value);
  if (isGridField(field)) return !!object && Object.keys(value).every(k => gridRows(field).includes(k)) && Object.values(value).every(v => field.type === 'checkbox_grid' ? Array.isArray(v) : typeof v === 'string');
  if (field.type === 'menu_quantity') return !!object && Object.keys(value).every(k => field.options?.includes(k)) && Object.values(value).every(v => typeof v === 'number');
  if (object || Array.isArray(value)) return false;
  if (field.type === 'number') return String(value).trim() !== '' && Number.isFinite(Number(value));
  if (field.type === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(String(value));
  if (field.type === 'slider') return String(value).trim() !== '' && Number.isFinite(Number(value));
  if (field.type === 'time') return /^\d{2}:\d{2}(?::\d{2})?$/.test(String(value));
  return true;
}
