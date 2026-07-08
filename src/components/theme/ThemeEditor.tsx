import type { EventTheme } from '@/lib/types';
import { fontOptions, themePresets } from '@/lib/defaults';
import { themeStyle, buttonClass } from '@/lib/theme';
import { Card } from '@/components/ui/basics';
import { ColorInput, Field, Select, Switch } from '@/components/ui/inputs';
import { cn } from '@/lib/utils';

export function ThemeEditor({ theme, onChange, eventName }: {
  theme: EventTheme;
  onChange: (t: EventTheme) => void;
  eventName: string;
}) {
  const set = (patch: Partial<EventTheme>) => onChange({ ...theme, ...patch, preset: patch.preset ?? 'custom' });

  return (
    <div className="space-y-5">
      <Card title="Theme presets">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {themePresets.map((p) => (
            <button
              key={p.id}
              onClick={() => onChange({ ...p.theme })}
              className={cn(
                'rounded-xl border p-3 text-left transition hover:shadow-card',
                theme.preset === p.id ? 'border-navy-500 ring-2 ring-navy-200' : 'border-slate-200'
              )}
            >
              <span className="mb-2 flex gap-1.5">
                <span className="h-4 w-4 rounded-full" style={{ background: p.theme.primary }} />
                <span className="h-4 w-4 rounded-full" style={{ background: p.theme.secondary }} />
                <span className="h-4 w-4 rounded-full" style={{ background: p.theme.accent }} />
              </span>
              <span className="text-xs font-medium text-slate-700">{p.name}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card title="Colours and style">
        <div className="grid gap-4 sm:grid-cols-2">
          <ColorInput label="Primary colour" value={theme.primary} onChange={(v) => set({ primary: v })} />
          <ColorInput label="Secondary colour" value={theme.secondary} onChange={(v) => set({ secondary: v })} />
          <ColorInput label="Accent colour" value={theme.accent} onChange={(v) => set({ accent: v })} />
          <ColorInput label="Page background" value={theme.background} onChange={(v) => set({ background: v })} />
          <ColorInput label="Card background" value={theme.card} onChange={(v) => set({ card: v })} />
          <ColorInput label="Text colour" value={theme.text} onChange={(v) => set({ text: v })} />
          <Field label="Body font">
            <Select value={theme.font} onChange={(e) => set({ font: e.target.value })} aria-label="Body font">
              {fontOptions.map((f) => <option key={f} value={f}>{f}</option>)}
            </Select>
          </Field>
          <Field label="Heading font">
            <Select value={theme.headingFont} onChange={(e) => set({ headingFont: e.target.value })} aria-label="Heading font">
              {fontOptions.map((f) => <option key={f} value={f}>{f}</option>)}
            </Select>
          </Field>
          <Field label={`Corner radius: ${theme.radius}px`}>
            <input
              type="range" min={0} max={28} value={theme.radius}
              onChange={(e) => set({ radius: Number(e.target.value) })}
              className="w-full accent-navy-700"
              aria-label="Corner radius"
            />
          </Field>
          <Field label="Button style">
            <Select value={theme.buttonStyle} onChange={(e) => set({ buttonStyle: e.target.value as EventTheme['buttonStyle'] })} aria-label="Button style">
              <option value="solid">Solid</option>
              <option value="outline">Outline</option>
              <option value="pill">Pill</option>
            </Select>
          </Field>
        </div>
        <div className="mt-4">
          <Switch
            checked={theme.animations}
            onChange={(animations) => set({ animations })}
            label="Enable page animations"
            description="Gentle fade and slide effects on the public page."
          />
        </div>
      </Card>

      <Card title="Live preview" padded={false}>
        <div className="event-theme rounded-b-2xl p-6" style={themeStyle(theme)}>
          <div className="ev-card mx-auto max-w-sm space-y-3 p-5 shadow-lg">
            <span
              className="inline-block rounded-full px-3 py-1 text-xs font-semibold"
              style={{ background: 'var(--ev-secondary)', color: 'var(--ev-text)' }}
            >
              HeadStart Event
            </span>
            <h3 className="text-xl font-bold" style={{ color: 'var(--ev-primary)' }}>{eventName || 'Event name'}</h3>
            <p className="text-sm opacity-80">This is how cards, text and buttons will look on the public registration page.</p>
            <input className="ev-input w-full border border-slate-200 px-3 py-2 text-sm" placeholder="Sample input" readOnly />
            <button className={cn(buttonClass(theme), 'w-full px-4 py-2.5 text-sm font-semibold')}>Register now</button>
          </div>
        </div>
      </Card>
    </div>
  );
}
