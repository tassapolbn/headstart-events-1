import { EmailTemplateEditor } from '@/components/email/EmailTemplateEditor';
import type { TabProps } from '../EventEditorPage';

export default function EmailTab({ draft, update }: TabProps) {
  return (
    <EmailTemplateEditor
      event={draft}
      template={draft.email_template}
      onChange={(email_template) => update({ email_template })}
    />
  );
}
