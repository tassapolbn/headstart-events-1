import type { EventTheme } from '@/lib/types';
import { Card } from '@/components/ui/basics';
import { ColorInput, Field, Select } from '@/components/ui/inputs';

export function DesignControls({ theme: t, onChange }: { theme: EventTheme; onChange: (patch: Partial<EventTheme>) => void }) {
  const colors = [
    ['gradientFrom', 'Accent line start', t.primary], ['gradientTo', 'Accent line end', t.secondary],
    ['helpColor', 'Question descriptions', t.text], ['inputColor', 'Answer text', t.text],
    ['inputBackground', 'Answer background', '#fafbfd'], ['inputBorder', 'Answer border', '#cbd5e1'],
    ['buttonColor', 'Button background / border', t.primary], ['buttonTextColor', 'Button text', '#ffffff'],
  ] as const;
  return <Card title="Accent line and answer colours"><div className="grid gap-4 sm:grid-cols-2">
    {colors.map(([key, label, fallback]) => <ColorInput key={key} label={label} value={t[key] ?? fallback} onChange={value => onChange({ [key]: value })} />)}
    <Field label="Accent line position"><Select aria-label="Accent line position" value={t.gradientPosition ?? 'top'} onChange={e => onChange({ gradientPosition: e.target.value as EventTheme['gradientPosition'] })}>
      <option value="top">Top of form cards</option><option value="bottom">Bottom of form cards</option><option value="left">Left edge</option><option value="right">Right edge</option><option value="none">Hidden</option>
    </Select></Field>
    {([['gradientAngle', 'Accent gradient direction', 90, 0, 360], ['gradientThickness', 'Accent line thickness', 5, 1, 16], ['backgroundAngle', 'Page gradient direction', 170, 0, 360]] as const).map(([key, label, fallback, min, max]) =>
      <Field key={key} label={`${label}: ${t[key] ?? fallback}`}><input aria-label={label} type="range" min={min} max={max} value={t[key] ?? fallback} onChange={e => onChange({ [key]: Number(e.target.value) })} /></Field>)}
  </div></Card>;
}
