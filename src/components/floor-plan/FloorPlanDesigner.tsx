import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download, Grid3X3, Hand, MousePointer2, PenSquare, Plus, Save, Upload, ZoomIn, ZoomOut,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Booth, FloorPlanSettings } from '@/lib/types';
import { boothFill, boothStatusMeta } from '@/lib/boothColors';
import { contrastText, download, uid, clamp } from '@/lib/utils';
import { flagForText } from '@/lib/countries';
import { useToast } from '@/context/ToastContext';
import { Button, Card, Spinner } from '@/components/ui/basics';
import { Input, Select } from '@/components/ui/inputs';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { Legend } from './Legend';
import { BoothPropsPanel } from './BoothPropsPanel';
import { exportLayout, makeBooth, orientationPresets, pointerToPlan, snap, type PlanExport } from './planUtils';

type Tool = 'select' | 'draw' | 'pan';
interface DragState {
  mode: 'move' | 'resize' | 'draw' | 'pan';
  boothId?: string;
  handle?: 'nw' | 'ne' | 'sw' | 'se';
  startX: number;
  startY: number;
  orig?: { x: number; y: number; w: number; h: number };
  scrollLeft?: number;
  scrollTop?: number;
  clientX?: number;
  clientY?: number;
}

export function FloorPlanDesigner({ eventId, plan, onPlanChange }: {
  eventId: string;
  plan: FloorPlanSettings;
  onPlanChange: (plan: FloorPlanSettings) => void;
}) {
  const { toast } = useToast();
  const svgRef = useRef<SVGSVGElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const drag = useRef<DragState | null>(null);

  const [booths, setBooths] = useState<Booth[]>([]);
  const [loadedIds, setLoadedIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [zoom, setZoom] = useState(0.55);
  const [drawDraft, setDrawDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const selected = useMemo(() => booths.find((b) => b.id === selectedId) ?? null, [booths, selectedId]);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.from('booths').select('*').eq('event_id', eventId).order('created_at');
      if (error) toast(error.message, 'error');
      const list = (data ?? []) as Booth[];
      setBooths(list);
      setLoadedIds(list.map((b) => b.id));
      setLoading(false);
    }
    void load();
  }, [eventId]);

  function patchBooth(id: string, patch: Partial<Booth>) {
    setBooths((all) => all.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  function addBoothAtCenter() {
    const b = makeBooth(eventId, snap(plan.width / 2 - 60, plan), snap(plan.height / 2 - 40, plan), 120, 80, booths.length);
    setBooths((all) => [...all, b]);
    setSelectedId(b.id);
  }

  function duplicateSelected() {
    if (!selected) return;
    const copy: Booth = { ...selected, id: uid(), x: selected.x + 24, y: selected.y + 24, label: `${selected.label} copy`, status: selected.status === 'booked' ? 'available' : selected.status, booked_label: null };
    setBooths((all) => [...all, copy]);
    setSelectedId(copy.id);
  }

  function deleteSelected() {
    if (!selected) return;
    setBooths((all) => all.filter((b) => b.id !== selected.id));
    setSelectedId(null);
  }

  // ----- pointer interactions --------------------------------------
  function onCanvasPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    svg.setPointerCapture(e.pointerId);
    const p = pointerToPlan(e, svg, plan);

    if (tool === 'pan') {
      const sc = scrollRef.current!;
      drag.current = { mode: 'pan', startX: p.x, startY: p.y, scrollLeft: sc.scrollLeft, scrollTop: sc.scrollTop, clientX: e.clientX, clientY: e.clientY };
      return;
    }
    if (tool === 'draw') {
      drag.current = { mode: 'draw', startX: snap(p.x, plan), startY: snap(p.y, plan) };
      setDrawDraft({ x: snap(p.x, plan), y: snap(p.y, plan), w: 0, h: 0 });
      return;
    }
    // select tool clicking empty canvas clears selection
    if (e.target === e.currentTarget || (e.target as Element).tagName === 'image' || (e.target as Element).id === 'plan-bg') {
      setSelectedId(null);
    }
  }

  function onBoothPointerDown(e: React.PointerEvent, booth: Booth) {
    if (tool !== 'select') return;
    e.stopPropagation();
    const svg = svgRef.current;
    if (!svg) return;
    svg.setPointerCapture(e.pointerId);
    setSelectedId(booth.id);
    const p = pointerToPlan(e, svg, plan);
    drag.current = { mode: 'move', boothId: booth.id, startX: p.x, startY: p.y, orig: { x: booth.x, y: booth.y, w: booth.w, h: booth.h } };
  }

  function onHandlePointerDown(e: React.PointerEvent, booth: Booth, handle: DragState['handle']) {
    e.stopPropagation();
    const svg = svgRef.current;
    if (!svg) return;
    svg.setPointerCapture(e.pointerId);
    const p = pointerToPlan(e, svg, plan);
    drag.current = { mode: 'resize', boothId: booth.id, handle, startX: p.x, startY: p.y, orig: { x: booth.x, y: booth.y, w: booth.w, h: booth.h } };
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    const svg = svgRef.current;
    if (!d || !svg) return;
    const p = pointerToPlan(e, svg, plan);

    if (d.mode === 'pan') {
      const sc = scrollRef.current!;
      sc.scrollLeft = (d.scrollLeft ?? 0) - (e.clientX - (d.clientX ?? 0));
      sc.scrollTop = (d.scrollTop ?? 0) - (e.clientY - (d.clientY ?? 0));
      return;
    }
    if (d.mode === 'draw') {
      setDrawDraft({
        x: Math.min(d.startX, snap(p.x, plan)),
        y: Math.min(d.startY, snap(p.y, plan)),
        w: Math.abs(snap(p.x, plan) - d.startX),
        h: Math.abs(snap(p.y, plan) - d.startY),
      });
      return;
    }
    if (!d.boothId || !d.orig) return;
    const dx = p.x - d.startX;
    const dy = p.y - d.startY;

    if (d.mode === 'move') {
      patchBooth(d.boothId, {
        x: clamp(snap(d.orig.x + dx, plan), 0, plan.width - d.orig.w),
        y: clamp(snap(d.orig.y + dy, plan), 0, plan.height - d.orig.h),
      });
    } else if (d.mode === 'resize' && d.handle) {
      let { x, y, w, h } = d.orig;
      if (d.handle.includes('e')) w = Math.max(24, snap(d.orig.w + dx, plan));
      if (d.handle.includes('s')) h = Math.max(24, snap(d.orig.h + dy, plan));
      if (d.handle.includes('w')) {
        const nx = clamp(snap(d.orig.x + dx, plan), 0, d.orig.x + d.orig.w - 24);
        w = d.orig.w + (d.orig.x - nx);
        x = nx;
      }
      if (d.handle.includes('n')) {
        const ny = clamp(snap(d.orig.y + dy, plan), 0, d.orig.y + d.orig.h - 24);
        h = d.orig.h + (d.orig.y - ny);
        y = ny;
      }
      patchBooth(d.boothId, { x, y, w, h });
    }
  }

  function onPointerUp() {
    const d = drag.current;
    if (d?.mode === 'draw' && drawDraft) {
      if (drawDraft.w >= 24 && drawDraft.h >= 24) {
        const b = { ...makeBooth(eventId, drawDraft.x, drawDraft.y, drawDraft.w, drawDraft.h, booths.length) };
        setBooths((all) => [...all, b]);
        setSelectedId(b.id);
        setTool('select');
      }
      setDrawDraft(null);
    }
    drag.current = null;
  }

  // ----- persistence ------------------------------------------------
  async function saveLayout() {
    setSaving(true);
    try {
      const removed = loadedIds.filter((id) => !booths.some((b) => b.id === id));
      if (removed.length > 0) {
        const { data: used } = await supabase
          .from('registrations')
          .select('id, booth_id')
          .in('booth_id', removed)
          .not('status', 'in', '("rejected","cancelled")');
        if (used && used.length > 0) {
          toast('Some deleted booths still have active registrations. Release or reassign those registrations first.', 'error');
          setSaving(false);
          return;
        }
        const { error: delErr } = await supabase.from('booths').delete().in('id', removed);
        if (delErr) throw delErr;
      }
      if (booths.length > 0) {
        const rows = booths.map((b) => ({ ...b, event_id: eventId }));
        const { error } = await supabase.from('booths').upsert(rows);
        if (error) throw error;
      }
      setLoadedIds(booths.map((b) => b.id));
      toast('Floor plan layout saved.');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save the layout.', 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleExport() {
    download(`floor-plan-${eventId}.json`, JSON.stringify(exportLayout(plan, booths), null, 2), 'application/json');
  }

  function handleImport(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as PlanExport;
        if (parsed.plan) onPlanChange({ ...plan, ...parsed.plan, enabled: plan.enabled });
        if (Array.isArray(parsed.booths)) {
          setBooths(parsed.booths.map((b) => ({ ...b, id: uid(), event_id: eventId })));
          setSelectedId(null);
        }
        toast('Layout imported. Press "Save layout" to keep it.');
      } catch {
        toast('That file is not a valid floor plan export.', 'error');
      }
    };
    reader.readAsText(file);
  }

  function setOrientation(o: 'landscape' | 'portrait' | 'custom') {
    if (o === 'custom') return;
    onPlanChange({ ...plan, orientation: o, ...orientationPresets[o] });
  }

  const toolBtn = (t: Tool, icon: React.ReactNode, label: string) => (
    <button
      onClick={() => setTool(t)}
      aria-label={label}
      aria-pressed={tool === t}
      title={label}
      className={`rounded-lg p-2 transition ${tool === t ? 'bg-navy-700 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
    >
      {icon}
    </button>
  );

  if (loading) return <Card><div className="flex justify-center p-10"><Spinner size={26} /></div></Card>;

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
      <Card padded={false}>
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2">
          <div className="flex items-center gap-0.5 rounded-xl border border-slate-200 p-0.5">
            {toolBtn('select', <MousePointer2 className="h-4 w-4" />, 'Select and move')}
            {toolBtn('draw', <PenSquare className="h-4 w-4" />, 'Draw a booth')}
            {toolBtn('pan', <Hand className="h-4 w-4" />, 'Pan the canvas')}
          </div>
          <Button size="sm" variant="outline" icon={<Plus className="h-3.5 w-3.5" />} onClick={addBoothAtCenter}>Add booth</Button>
          <div className="flex items-center gap-1">
            <button aria-label="Zoom out" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => setZoom((z) => clamp(z - 0.1, 0.2, 2))}><ZoomOut className="h-4 w-4" /></button>
            <span className="w-10 text-center text-xs text-slate-500">{Math.round(zoom * 100)}%</span>
            <button aria-label="Zoom in" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => setZoom((z) => clamp(z + 0.1, 0.2, 2))}><ZoomIn className="h-4 w-4" /></button>
          </div>
          <button
            aria-label="Toggle grid" aria-pressed={plan.showGrid} title="Toggle grid"
            className={`rounded-lg p-2 ${plan.showGrid ? 'bg-navy-50 text-navy-700' : 'text-slate-500 hover:bg-slate-100'}`}
            onClick={() => onPlanChange({ ...plan, showGrid: !plan.showGrid })}
          >
            <Grid3X3 className="h-4 w-4" />
          </button>
          <Select
            value={plan.orientation}
            onChange={(e) => setOrientation(e.target.value as 'landscape' | 'portrait')}
            className="w-32 py-1.5 text-xs" aria-label="Canvas orientation"
          >
            <option value="landscape">Landscape</option>
            <option value="portrait">Portrait</option>
          </Select>
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <Input type="number" className="w-20 py-1.5 text-xs" value={plan.width} aria-label="Canvas width" onChange={(e) => onPlanChange({ ...plan, width: Number(e.target.value) || plan.width })} />
            x
            <Input type="number" className="w-20 py-1.5 text-xs" value={plan.height} aria-label="Canvas height" onChange={(e) => onPlanChange({ ...plan, height: Number(e.target.value) || plan.height })} />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="outline" icon={<Upload className="h-3.5 w-3.5" />} onClick={() => fileRef.current?.click()}>Import</Button>
            <Button size="sm" variant="outline" icon={<Download className="h-3.5 w-3.5" />} onClick={handleExport}>Export</Button>
            <Button size="sm" icon={<Save className="h-3.5 w-3.5" />} loading={saving} onClick={() => void saveLayout()}>Save layout</Button>
          </div>
          <input ref={fileRef} type="file" accept=".json" className="hidden" aria-label="Import layout file" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = ''; }} />
        </div>

        {/* Canvas */}
        <div ref={scrollRef} className="max-h-[64vh] overflow-auto bg-slate-50 p-4">
          <svg
            ref={svgRef}
            className="plan-canvas mx-auto block rounded-xl border border-slate-200 bg-white shadow-sm"
            width={plan.width * zoom}
            height={plan.height * zoom}
            viewBox={`0 0 ${plan.width} ${plan.height}`}
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            role="application"
            aria-label="Floor plan designer canvas"
          >
            <defs>
              <pattern id="grid" width={plan.gridSize} height={plan.gridSize} patternUnits="userSpaceOnUse">
                <path d={`M ${plan.gridSize} 0 L 0 0 0 ${plan.gridSize}`} fill="none" stroke="#dbe3ee" strokeWidth="1" />
              </pattern>
            </defs>
            {plan.background_url && (
              <image id="plan-bg" href={plan.background_url} x="0" y="0" width={plan.width} height={plan.height} preserveAspectRatio="xMidYMid slice" opacity="0.9" />
            )}
            {plan.showGrid && <rect width={plan.width} height={plan.height} fill="url(#grid)" pointerEvents="none" />}

            {booths.map((b) => {
              const fill = boothFill(b.status, b.color);
              const text = contrastText(fill);
              const isSel = b.id === selectedId;
              const bookedFlag = b.status === 'booked' ? flagForText(b.booked_label) : '';
              const displayLabel = b.status === 'booked' && b.booked_label ? b.booked_label : b.label;
              return (
                <g key={b.id} opacity={b.hidden ? 0.35 : 1}>
                  <rect
                    x={b.x} y={b.y} width={b.w} height={b.h} rx={6}
                    fill={fill} fillOpacity={0.9}
                    stroke={isSel ? '#1a3c5e' : 'rgba(0,0,0,0.25)'}
                    strokeWidth={isSel ? 3 : 1}
                    className="booth-shape"
                    onPointerDown={(e) => onBoothPointerDown(e, b)}
                  />
                  {bookedFlag && (
                    <text
                      x={b.x + b.w / 2} y={b.y + b.h / 2 - Math.min(10, b.h / 6)}
                      textAnchor="middle" fontSize={Math.min(26, b.h / 2.6)} pointerEvents="none"
                    >
                      {bookedFlag}
                    </text>
                  )}
                  <text
                    x={b.x + b.w / 2}
                    y={bookedFlag ? b.y + b.h / 2 + Math.min(10, b.h / 6) : b.y + b.h / 2 - (displayLabel ? 4 : -4)}
                    textAnchor="middle" fontSize={bookedFlag ? Math.min(13, b.h / 5) : Math.min(22, b.h / 3)} fontWeight={700}
                    fill={text} pointerEvents="none"
                  >
                    {bookedFlag ? (displayLabel.length > 16 ? `${displayLabel.slice(0, 15)}…` : displayLabel) : b.number}
                  </text>
                  {!bookedFlag && displayLabel && (
                    <text
                      x={b.x + b.w / 2} y={b.y + b.h / 2 + Math.min(16, b.h / 4)}
                      textAnchor="middle" fontSize={Math.min(12, b.h / 5)}
                      fill={text} pointerEvents="none"
                    >
                      {displayLabel.length > 18 ? `${displayLabel.slice(0, 17)}…` : displayLabel}
                    </text>
                  )}
                  {isSel && (['nw', 'ne', 'sw', 'se'] as const).map((h) => (
                    <circle
                      key={h}
                      cx={h.includes('w') ? b.x : b.x + b.w}
                      cy={h.includes('n') ? b.y : b.y + b.h}
                      r={7}
                      fill="#1a3c5e" stroke="#fff" strokeWidth={2}
                      style={{ cursor: `${h}-resize` }}
                      onPointerDown={(e) => onHandlePointerDown(e, b, h)}
                    />
                  ))}
                </g>
              );
            })}

            {drawDraft && drawDraft.w > 0 && (
              <rect
                x={drawDraft.x} y={drawDraft.y} width={drawDraft.w} height={drawDraft.h}
                fill="#1a3c5e" fillOpacity={0.2} stroke="#1a3c5e" strokeDasharray="6 4" strokeWidth={2} rx={6}
              />
            )}
          </svg>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
          <Legend compact />
          <p className="text-xs text-slate-400">{booths.length} booths - unsaved layout changes are kept until you press Save layout</p>
        </div>
      </Card>

      {/* Right panel */}
      <div className="space-y-4">
        {selected ? (
          <BoothPropsPanel
            booth={selected}
            onChange={(p) => patchBooth(selected.id, p)}
            onDuplicate={duplicateSelected}
            onDelete={deleteSelected}
          />
        ) : (
          <Card title="Booth designer">
            <ul className="list-inside space-y-2 text-sm text-slate-600">
              <li>Use the pen tool to draw booths, or press Add booth.</li>
              <li>Click a booth to rename, renumber, colour or change its status.</li>
              <li>Drag booths to move them; drag the corner dots to resize.</li>
              <li>Statuses like Stage, Toilet and Food Zone mark special areas.</li>
              <li>Press Save layout when you are happy with the plan.</li>
            </ul>
          </Card>
        )}
        <Card title="Background image">
          <ImageUpload
            label="Floor plan background"
            value={plan.background_url}
            onChange={(background_url) => onPlanChange({ ...plan, background_url })}
            prefix={`${eventId}/floorplan`}
            hint="Optional. Upload a hall drawing or map, then place booths on top."
          />
          <div className="mt-3">
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="grid-size">Grid size: {plan.gridSize}px</label>
            <input
              id="grid-size" type="range" min={10} max={50} step={5}
              value={plan.gridSize}
              onChange={(e) => onPlanChange({ ...plan, gridSize: Number(e.target.value) })}
              className="w-full accent-navy-700"
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
