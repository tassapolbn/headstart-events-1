import { FormBuilder } from '@/components/form-builder/FormBuilder';
import type { TabProps } from '../EventEditorPage';

export default function FormTab({ draft, update }: TabProps) {
  return (
    <FormBuilder
      fields={draft.form_schema}
      onChange={(form_schema) => update({ form_schema })}
      theme={draft.theme}
    />
  );
}
