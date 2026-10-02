import type { EmailDesign } from '@/lib/types';
import { emailDesign } from '@/lib/emailDesign';
import { fontOptions } from '@/lib/defaults';
import { Card } from '@/components/ui/basics';
import { ColorInput, Field, Select } from '@/components/ui/inputs';

export function EmailDesignEditor({ value, onChange }: { value?: EmailDesign; onChange: (design: EmailDesign) => void }) {
  const d = emailDesign(value);
  const set = (patch: EmailDesign) => onChange({ ...value, ...patch });
  return <Card title="Email design"><div className="grid gap-4 sm:grid-cols-2">
    <Field label="Header position"><Select aria-label="Email header position" value={d.headerPosition} onChange={e => set({ headerPosition: e.target.value as EmailDesign['headerPosition'] })}>
      <option value="top">At the top</option><option value="afterBanner">Below the banner</option><option value="bottom">Below the message</option><option value="hidden">Hide header</option>
    </Select></Field>
    <Field label="Header alignment"><Select aria-label="Email header alignment" value={d.headerAlign} onChange={e => set({ headerAlign: e.target.value as EmailDesign['headerAlign'] })}>
      <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
    </Select></Field>
    {([['headerColor', 'Header background'], ['headerTextColor', 'Header text'], ['pageColor', 'Outer background'], ['bodyColor', 'Message background'], ['textColor', 'Message text'], ['buttonColor', 'Button background'], ['buttonTextColor', 'Button text'], ['footerColor', 'Footer background'], ['footerTextColor', 'Footer text']] as const).map(([key, label]) =>
      <ColorInput key={key} label={label} value={d[key]} onChange={color => set({ [key]: color })} />)}
    <Field label="Email font" hint="Email apps that do not support web fonts use Arial as a fallback."><Select aria-label="Email font" value={d.font} onChange={e => set({ font: e.target.value })}>
      {['Arial', ...fontOptions].map(font => <option key={font}>{font}</option>)}
    </Select></Field>
    {([['headerPadding', 'Header spacing', 0, 64], ['logoHeight', 'Logo height', 24, 160]] as const).map(([key, label, min, max]) =>
      <Field key={key} label={`${label}: ${d[key]}px`}><input aria-label={`Email ${label.toLowerCase()}`} type="range" min={min} max={max} value={d[key]} onChange={e => set({ [key]: Number(e.target.value) })} /></Field>)}
  </div></Card>;
}
