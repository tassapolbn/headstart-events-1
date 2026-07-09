import { Copy, Trash2 } from 'lucide-react';
import type { Booth, BoothStatus } from '@/lib/types';
import { boothStatusChoices, boothStatusMeta, isMarkerStatus } from '@/lib/boothColors';
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
          <Field label={isMarkerStatus(booth.status) ? 'Marker name' : 'Booth name'}>
            <Input value={booth.label} onChange={(e) => onChange({ label: e.target.value })} />
          </Field>
          {!isMarkerStatus(booth.status) && (
            <Field label="Booth number">
              <Input value={booth.number} onChange={(e) => onChange({ number: e.target.value })} />
            </Field>
          )}
        </div>
        {isMarkerStatus(booth.status) && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Markers like {boothStatusMeta[booth.status].label} show an icon and name only. Visitors cannot click them and they need no number.
          </p>
        )}

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

        <Field label={`Text size${booth.font_size ? `: ${booth.font_size}px` : ': automatic'}`}>
          <div className="flex items-center gap-2">
            <input
              type="range" min={8} max={44} step={1}
              value={booth.font_size ?? 0}
              onChange={(e) => onChange({ font_size: Number(e.target.value) < 8 ? null : Number(e.target.value) })}
              className="w-full accent-navy-700"
              aria-label="Booth text size"
            />
            {booth.font_size && (
              <button type="button" className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100" onClick={() => onChange({ font_size: null })}>
                Auto
              </button>
            )}
          </div>
        </Field>

        <Field label="Group / Zone" hint="e.g. Outside Provider Zone, Food Court. Used for vendor type zones and analytics.">
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
