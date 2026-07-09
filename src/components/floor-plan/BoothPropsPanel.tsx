import { useState } from 'react';
import {
  AlignHorizontalJustifyStart, AlignVerticalJustifyStart, Copy,
  StretchHorizontal, StretchVertical, Trash2,
} from 'lucide-react';
import type { Booth, BoothStatus } from '@/lib/types';
import { boothStatusChoices, boothStatusMeta, isMarkerStatus } from '@/lib/boothColors';
import { cn } from '@/lib/utils';
import { Button, Card } from '@/components/ui/basics';
import { ColorInput, Field, Input, Select, Switch, Textarea } from '@/components/ui/inputs';

function TypeChips({ vendorTypes, value, onChange }: {
  vendorTypes: string[];
  value: string[];
  onChange: (types: string[]) => void;
}) {
  function toggle(t: string) {
    onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t]);
  }
  return (
    <div className="space-y-1.5">
      <span className="block text-sm font-medium text-slate-700">Who can select this booth</span>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onChange([])}
          aria-pressed={value.length === 0}
          className={cn(
            'rounded-full border px-3 py-1 text-xs font-medium transition',
            value.length === 0 ? 'border-navy-600 bg-navy-700 text-white' : 'border-slate-300 text-slate-500 hover:border-navy-300'
          )}
        >
          Everyone
        </button>
        {vendorTypes.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => toggle(t)}
            aria-pressed={value.includes(t)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition',
              value.includes(t) ? 'border-gold-500 bg-gold-400 text-navy-900' : 'border-slate-300 text-slate-500 hover:border-gold-400'
            )}
          >
            {t}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        {value.length === 0
          ? 'Any registrant may pick this booth.'
          : `Only: ${value.join(', ')}. Enforced by the database.`}
      </p>
    </div>
  );
}

export function BoothPropsPanel({ booth, vendorTypes, onChange, onDuplicate, onDelete }: {
  booth: Booth;
  vendorTypes: string[];
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

        {vendorTypes.length > 0 && boothStatusMeta[booth.status].selectable && (
          <TypeChips
            vendorTypes={vendorTypes}
            value={booth.allowed_types ?? []}
            onChange={(allowed_types) => onChange({ allowed_types: allowed_types.length > 0 ? allowed_types : null })}
          />
        )}

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

        <Field label="Group" hint="Optional, for your own organisation and analytics.">
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

export function MultiBoothPanel({ count, vendorTypes, canDistribute, onAlign, onStatus, onAllowedTypes, onGroup, onDuplicate, onDelete }: {
  count: number;
  vendorTypes: string[];
  canDistribute: boolean;
  onAlign: (kind: 'row' | 'col' | 'spaceH' | 'spaceV') => void;
  onStatus: (status: BoothStatus) => void;
  onAllowedTypes: (types: string[]) => void;
  onGroup: (group: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [types, setTypes] = useState<string[]>([]);
  const [group, setGroup] = useState('');

  return (
    <Card title={`${count} booths selected`}>
      <div className="space-y-4">
        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-700">Arrange</span>
          <div className="grid grid-cols-2 gap-1.5">
            <Button size="sm" variant="outline" icon={<AlignHorizontalJustifyStart className="h-3.5 w-3.5" />} onClick={() => onAlign('row')}>Align in a row</Button>
            <Button size="sm" variant="outline" icon={<AlignVerticalJustifyStart className="h-3.5 w-3.5" />} onClick={() => onAlign('col')}>Align in a column</Button>
            <Button size="sm" variant="outline" disabled={!canDistribute} icon={<StretchHorizontal className="h-3.5 w-3.5" />} onClick={() => onAlign('spaceH')}>Equal gaps ↔</Button>
            <Button size="sm" variant="outline" disabled={!canDistribute} icon={<StretchVertical className="h-3.5 w-3.5" />} onClick={() => onAlign('spaceV')}>Equal gaps ↕</Button>
          </div>
          <p className="mt-1 text-xs text-slate-500">Equal gaps needs at least 3 booths selected. Tip: drag on empty space to select many booths at once; Shift+click adds one more.</p>
        </div>

        <Field label="Set status for all">
          <Select defaultValue="" onChange={(e) => { if (e.target.value) onStatus(e.target.value as BoothStatus); e.target.value = ''; }} aria-label="Set status for all selected">
            <option value="" disabled>Choose a status…</option>
            {boothStatusChoices.map((s) => <option key={s} value={s}>{boothStatusMeta[s].label}</option>)}
          </Select>
        </Field>

        {vendorTypes.length > 0 && (
          <div className="space-y-1.5">
            <span className="block text-sm font-medium text-slate-700">Who can select these booths</span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setTypes([])}
                aria-pressed={types.length === 0}
                className={cn('rounded-full border px-3 py-1 text-xs font-medium', types.length === 0 ? 'border-navy-600 bg-navy-700 text-white' : 'border-slate-300 text-slate-500')}
              >
                Everyone
              </button>
              {vendorTypes.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTypes((cur) => cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t])}
                  aria-pressed={types.includes(t)}
                  className={cn('rounded-full border px-3 py-1 text-xs font-medium', types.includes(t) ? 'border-gold-500 bg-gold-400 text-navy-900' : 'border-slate-300 text-slate-500')}
                >
                  {t}
                </button>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={() => onAllowedTypes(types)}>Apply to {count} booths</Button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <Field label="Set group for all" className="flex-1">
            <Input value={group} onChange={(e) => setGroup(e.target.value)} placeholder="e.g. Food Court" />
          </Field>
          <Button size="sm" variant="outline" onClick={() => onGroup(group)}>Apply</Button>
        </div>

        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="outline" icon={<Copy className="h-3.5 w-3.5" />} onClick={onDuplicate}>Duplicate all</Button>
          <Button size="sm" variant="danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={onDelete}>Delete all</Button>
        </div>
      </div>
    </Card>
  );
}
