import { z } from 'zod';
import type { FieldValues, Resolver } from 'react-hook-form';
import type { FormField } from '@/lib/types';

const CONTENT_TYPES = ['heading', 'rich_text', 'divider'];

export function isContentField(f: FormField): boolean {
  return CONTENT_TYPES.includes(f.type);
}

/** Evaluate a conditional question against the current answers. */
export function isVisible(field: FormField, values: FieldValues): boolean {
  const c = field.condition;
  if (!c || !c.fieldId) return true;
  const raw = values[c.fieldId];
  const answered = Array.isArray(raw) ? raw.length > 0 : raw !== undefined && raw !== null && raw !== '';
  switch (c.operator) {
    case 'answered':
      return answered;
    case 'equals':
      return Array.isArray(raw) ? raw.includes(c.value ?? '') : String(raw ?? '') === (c.value ?? '');
    case 'not_equals':
      return Array.isArray(raw) ? !raw.includes(c.value ?? '') : String(raw ?? '') !== (c.value ?? '');
    case 'contains':
      if (Array.isArray(raw)) return raw.includes(c.value ?? '');
      return String(raw ?? '').toLowerCase().includes((c.value ?? '').toLowerCase());
    default:
      return true;
  }
}

function schemaForField(f: FormField): z.ZodTypeAny {
  const v = f.validation ?? {};
  switch (f.type) {
    case 'email': {
      let s = z.string().trim();
      if (f.required) s = s.min(1, 'This field is required.');
      return f.required || true ? s.refine((val) => val === '' && !f.required ? true : /^\S+@\S+\.\S+$/.test(val), 'Please enter a valid email address.') : s;
    }
    case 'phone': {
      const s = z.string().trim();
      return s.refine((val) => (!f.required && val === '') || /^[0-9+()\-\s]{6,20}$/.test(val), f.required ? 'Please enter a valid phone number.' : 'Please enter a valid phone number or leave it empty.');
    }
    case 'number': {
      return z.string().trim().superRefine((val, ctx) => {
        if (val === '') {
          if (f.required) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'This field is required.' });
          return;
        }
        const n = Number(val);
        if (Number.isNaN(n)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Please enter a number.' });
        else {
          if (v.min !== undefined && n < v.min) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Minimum is ${v.min}.` });
          if (v.max !== undefined && n > v.max) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Maximum is ${v.max}.` });
        }
      });
    }
    case 'menu_quantity': {
      return z.record(z.number()).superRefine((val, ctx) => {
        const total = Object.values(val ?? {}).reduce((a, b) => a + (b || 0), 0);
        if (f.required && total < 1) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Please choose at least one item.' });
        }
        if (f.validation?.max !== undefined && total > f.validation.max) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Please choose at most ${f.validation.max} in total.` });
        }
      });
    }
    case 'checkboxes': {
      let s = z.array(z.string());
      if (f.required) s = s.min(1, 'Please select at least one option.');
      if (v.max !== undefined) s = s.max(v.max, `Please select at most ${v.max}.`);
      return s;
    }
    case 'file':
    case 'photo': {
      return z.any().superRefine((val, ctx) => {
        const file = val instanceof FileList ? val[0] : (val as File | undefined);
        if (!file) {
          if (f.required) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Please choose a file.' });
          return;
        }
        const maxMB = f.maxSizeMB ?? 10;
        if (file.size > maxMB * 1024 * 1024) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `The file must be smaller than ${maxMB} MB.` });
        }
      });
    }
    case 'signature': {
      const s = z.string();
      return f.required ? s.min(10, 'Please sign in the box.') : s;
    }
    default: {
      let s = z.string().trim();
      if (f.required) s = s.min(1, 'This field is required.');
      if (v.minLength !== undefined) s = s.min(v.minLength, `Please enter at least ${v.minLength} characters.`);
      if (v.maxLength !== undefined) s = s.max(v.maxLength, `Please keep this under ${v.maxLength} characters.`);
      if (v.pattern) {
        try {
          const re = new RegExp(v.pattern);
          return s.refine((val) => val === '' || re.test(val), 'The format does not look right.');
        } catch {
          return s;
        }
      }
      return s;
    }
  }
}

/**
 * A react-hook-form resolver that validates only the currently visible
 * questions, so hidden conditional fields never block submission.
 */
export function buildResolver(fields: FormField[]): Resolver<FieldValues> {
  return async (values) => {
    const errors: Record<string, { type: string; message: string }> = {};
    for (const f of fields) {
      if (isContentField(f)) continue;
      if (!isVisible(f, values)) continue;
      const result = schemaForField(f).safeParse(values[f.id] ?? (f.type === 'checkboxes' ? [] : f.type === 'menu_quantity' ? {} : ''));
      if (!result.success) {
        errors[f.id] = { type: 'validation', message: result.error.issues[0]?.message ?? 'Invalid value.' };
      }
    }
    return { values, errors };
  };
}
