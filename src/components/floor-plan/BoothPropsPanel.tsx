import { Copy, Trash2 } from 'lucide-react';
import type { Booth, BoothStatus } from '@/lib/types';
import { boothStatusChoices, boothStatusMeta } from '@/lib/boothColors';
import { Button, Card } from '@/components/ui/basics';
import { ColorInput, Field, Input, Select, Switch, Textarea } from '@/components/ui/inputs';

export function BoothPropsPanel({ booth, onChange, onDuplicate, onDelete }: {
  booth: Booth;
  onChange: (patch: Partial<Booth>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <Card title={`Booth: ${booth.label || booth.number || 'untitled'}`}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Booth name">
            <Input value={booth.label} onChange={(e) => onChange({ label: e.target.value })} />
          </Field>
          <Field label="Booth number">
            <Input value={booth.number} onChange={(e) => onChange({ number: e.target.value })} />
          </Field>
        </div>

        <Field label="Status">
          <Select value={booth.status} onChange={(e) => onChange({ status: e.target.value as BoothStatus })} aria-label="Booth status">
            {boothStatusChoices.map((s) => (
              <option key={s} value={s}>{boothStatusMeta[s].label}</option>
            ))}
          </Select>
        </Field>

        <div className="flex items-end gap-3">
          <ColorInput label="Custom colour" value={booth.color ?? boothStatusMeta[booth.status].color} onChange={(color) => onChange({ color })} />
          {booth.color && (
            <Button size="sm" variant="ghost" onClick={() => onChange({ color: null })}>Use status colour</Button>
          )}
        </div>

        <div className="grid grid-cols-4 gap-2">
          {(['x', 'y', 'w', 'h'] as const).map((k) => (
            <Field key={k} label={k.toUpperCase()}>
              <Input
                type="number"
                value={Math.round(booth[k])}
                onChange={(e) => onChange({ [k]: Number(e.target.value) || 0 } as Partial<Booth>)}
              />
            </Field>
          ))}
        </div>

        <Field label="Group" hint="e.g. Food Court, Craft Corner. Used in analytics.">
          <Input value={booth.group_name ?? ''} onChange={(e) => onChange({ group_name: e.target.value || null })} />
        </Field>

        <Field label="Notes">
          <Textarea rows={2} value={booth.notes ?? ''} onChange={(e) => onChange({ notes: e.target.value || null })} />
        </Field>

        <Switch
          checked={booth.hidden}
          onChange={(hidden) => onChange({ hidden })}
          label="Hide from the public floor plan"
        />

        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="outline" icon={<Copy className="h-3.5 w-3.5" />} onClick={onDuplicate}>Duplicate</Button>
          <Button size="sm" variant="danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={onDelete}>Delete</Button>
        </div>
      </div>
    </Card>
  );
}
