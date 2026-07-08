import { Card } from '@/components/ui/basics';
import { Switch } from '@/components/ui/inputs';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { ThemeEditor } from '@/components/theme/ThemeEditor';
import type { TabProps } from '../EventEditorPage';

export default function BrandingTab({ draft, update }: TabProps) {
  const b = draft.branding;
  const set = (key: keyof typeof b) => (url: string | undefined) =>
    update({ branding: { ...b, [key]: url } });

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="Event images">
        <div className="grid gap-4 sm:grid-cols-2">
          <ImageUpload label="Event poster" value={b.poster_url} onChange={set('poster_url')} prefix={draft.id} hint="Shown beside the form. Portrait works best." />
          <ImageUpload label="Event banner" value={b.banner_url} onChange={set('banner_url')} prefix={draft.id} hint="Wide image across the top of the page." />
          <ImageUpload label="Header image" value={b.header_url} onChange={set('header_url')} prefix={draft.id} hint="Optional secondary header." />
          <ImageUpload label="School logo" value={b.logo_url} onChange={set('logo_url')} prefix={draft.id} hint="Overrides the default logo for this event." />
          <ImageUpload label="Background image" value={b.background_url} onChange={set('background_url')} prefix={draft.id} hint="Subtle full page background." />
        </div>
        <div className="mt-4">
          <Switch
            checked={!b.hide_logo}
            onChange={(show) => update({ branding: { ...b, hide_logo: !show } })}
            label="Show the floating logo over the banner"
            description="Turn this off when your banner artwork already includes the school logo."
          />
        </div>
      </Card>

      <ThemeEditor
        theme={draft.theme}
        onChange={(theme) => update({ theme })}
        eventName={draft.name}
      />
    </div>
  );
}
