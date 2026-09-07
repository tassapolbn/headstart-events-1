import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download, Grid3X3, Hand, Maximize2, MousePointer2, PenSquare, Plus, Save, Sparkles, Upload, ZoomIn, ZoomOut,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Booth, BoothStatus, FloorPlanSettings } from '@/lib/types';
import { boothFill, boothStatusMeta, isMarkerStatus } from '@/lib/boothColors';
import { contrastText, download, uid, clamp } from '@/lib/utils';
import { flagForText } from '@/lib/countries';
import { useToast } from '@/context/ToastContext';
import { Button, Card, Spinner } from '@/components/ui/basics';
import { Field, Input, Select } from '@/components/ui/inputs';
import { Modal } from '@/components/ui/overlays';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { Legend } from './Legend';
import { BoothPropsPanel, MultiBoothPanel } from './BoothPropsPanel';
import { exportLayout, makeBooth, orientationPresets, pointerToPlan, snap, type PlanExport } from './planUtils';

type Tool = 'select' | 'draw' | 'pan';
interface Rect { x: number; y: number; w: number; h: number }
interface DragState {
  mode: 'move' | 'resize' | 'draw' | 'pan' | 'marquee';
  boothId?: string;
  handle?: 'nw' | 'ne' | 'sw' | 'se';
  startX: number;
  startY: number;
  orig?: Rect;
  origins?: Record<string, { x: number; y: number }>;
  shift?: boolean;
  scrollLeft?: number;
  scrollTop?: number;
  clientX?: number;
  clientY?: number;
}

export function FloorPlanDesigner({ eventId, plan, vendorTypes = [], onPlanChange }: {
  eventId: string;
  plan: FloorPlanSettings;
  vendorTypes?: string[];
  onPlanChange: (plan: FloorPlanSettings) => void;
}) {
  const { toast } = useToast();
  const svgRef = useRef<SVGSVGElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const drag = useRef<DragState | null>(null);

  const [booths, setBooths] = useState<Booth[]>([]);
  const [loadedIds, setLoadedIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tool, setTool] = useState<Tool>('select');
  const [zoom, setZoom] = useState(0.55);
  const [drawDraft, setDrawDraft] = useState<Rect | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Generate booths dialog
  const [genOpen, setGenOpen] = useState(false);
  const [genCount, setGenCount] = useState(10);
  const [genCols, setGenCols] = useState(5);
  const [genW, setGenW] = useState(120);
  const [genH, setGenH] = useState(80);
  const [genGap, setGenGap] = useState(24);
  const [genStart, setGenStart] = useState(1);

  const selectedBooths = useMemo(
    () => booths.filter((b) => selectedIds.includes(b.id)),
    [booths, selectedIds]
  );
  const single = selectedBooths.length === 1 ? selectedBooths[0] : null;

  function fitToScreen() {
    const sc = scrollRef.current;
    if (!sc) return;
    const availW = sc.clientWidth - 34;
    const availH = sc.clientHeight - 34;
    if (availW <= 0 || availH <= 0) return;
    setZoom(clamp(Math.min(availW / plan.width, availH / plan.height), 0.1, 2));
  }

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.from('booths').select('*').eq('event_id', eventId).order('created_at');
      if (error) toast(error.message, 'error');
      const list = (data ?? []) as Booth[];
      setBooths(list);
      setLoadedIds(list.map((b) => b.id));
      setLoading(false);
      window.setTimeout(fitToScreen, 60);
    }
    void load();
  }, [eventId]);

  useEffect(() => { window.setTimeout(fitToScreen, 60); }, [plan.width, plan.height, plan.orientation]);

  function patchBooth(id: string, patch: Partial<Booth>) {
    setBooths((all) => all.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }
  function patchSelected(patch: Partial<Booth>) {
    setBooths((all) => all.map((b) => (selectedIds.includes(b.id) ? { ...b, ...patch } : b)));
  }

  function addBoothAtCenter() {
    const b = makeBooth(eventId, snap(plan.width / 2 - 60, plan), snap(plan.height / 2 - 40, plan), 120, 80, booths.length);
    setBooths((all) => [...all, b]);
    setSelectedIds([b.id]);
  }

  function duplicateSelected() {
    const copies = selectedBooths.map((b) => ({
      ...b,
      id: uid(),
      x: b.x + 24,
      y: b.y + 24,
      status: (b.status === 'booked' ? 'available' : b.status) as BoothStatus,
      booked_label: null,
    }));
    setBooths((all) => [...all, ...copies]);
    setSelectedIds(copies.map((c) => c.id));
  }

  function deleteSelected() {
    setBooths((all) => all.filter((b) => !selectedIds.includes(b.id)));
    setSelectedIds([]);
  }

  // ----- generate a batch of numbered booths ------------------------
  function generateBooths() {
    const count = clamp(genCount, 1, 200);
    const cols = clamp(genCols, 1, 30);
    const created: Booth[] = [];
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const b = makeBooth(
        eventId,
        snap(40 + col * (genW + genGap), plan),
        snap(40 + row * (genH + genGap), plan),
        genW, genH, 0
      );
      b.number = String(genStart + i);
      b.label = `Booth ${genStart + i}`;
      created.push(b);
    }
    setBooths((all) => [...all, ...created]);
    setSelectedIds(created.map((b) => b.id));
    setGenOpen(false);
    setTool('select');
    toast(`${count} booths generated. Drag them into place, then press Save layout.`);
  }

  // ----- arrange tools ----------------------------------------------
  function arrange(kind: 'row' | 'col' | 'spaceH' | 'spaceV') {
    if (selectedBooths.length < 2) return;
    const list = [...selectedBooths];
    if (kind === 'row') {
      const top = Math.min(...list.map((b) => b.y));
      list.forEach((b) => patchBooth(b.id, { y: snap(top, plan) }));
    } else if (kind === 'col') {
      const left = Math.min(...list.map((b) => b.x));
      list.forEach((b) => patchBooth(b.id, { x: snap(left, plan) }));
    } else if (kind === 'spaceH') {
      if (list.length < 3) return;
      const sorted = list.sort((a, b) => a.x - b.x);
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const middle = sorted.slice(1, -1);
      const innerWidth = middle.reduce((sum, b) => sum + b.w, 0);
      const gap = (last.x - (first.x + first.w) - innerWidth) / (sorted.length - 1);
      let cursor = first.x + first.w + gap;
      for (const b of middle) {
        patchBooth(b.id, { x: Math.round(cursor) });
        cursor += b.w + gap;
      }
    } else if (kind === 'spaceV') {
      if (list.length < 3) return;
      const sorted = list.sort((a, b) => a.y - b.y);
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const middle = sorted.slice(1, -1);
      const innerHeight = middle.reduce((sum, b) => sum + b.h, 0);
      const gap = (last.y - (first.y + first.h) - innerHeight) / (sorted.length - 1);
      let cursor = first.y + first.h + gap;
      for (const b of middle) {
        patchBooth(b.id, { y: Math.round(cursor) });
        cursor += b.h + gap;
      }
    }
  }

  // ----- pointer interactions ---------------------------------------
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
    // select tool on empty canvas: start a marquee selection
    if (e.target === e.currentTarget || (e.target as Element).tagName === 'image' || (e.target as Element).id === 'plan-bg' || (e.target as Element).classList.contains('plan-grid')) {
      drag.current = { mode: 'marquee', startX: p.x, startY: p.y, shift: e.shiftKey };
      setMarquee({ x: p.x, y: p.y, w: 0, h: 0 });
    }
  }

  function onBoothPointerDown(e: React.PointerEvent, booth: Booth) {
    if (tool !== 'select') return;
    e.stopPropagation();
    const svg = svgRef.current;
    if (!svg) return;
    svg.setPointerCapture(e.pointerId);

    if (e.shiftKey) {
      setSelectedIds((cur) => cur.includes(booth.id) ? cur.filter((id) => id !== booth.id) : [...cur, booth.id]);
      return;
    }

    const ids = selectedIds.includes(booth.id) ? selectedIds : [booth.id];
    if (!selectedIds.includes(booth.id)) setSelectedIds([booth.id]);

    const p = pointerToPlan(e, svg, plan);
    const origins: Record<string, { x: number; y: number }> = {};
    for (const b of booths) if (ids.includes(b.id)) origins[b.id] = { x: b.x, y: b.y };
    drag.current = { mode: 'move', boothId: booth.id, startX: p.x, startY: p.y, origins };
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
    if (d.mode === 'marquee') {
      setMarquee({
        x: Math.min(d.startX, p.x),
        y: Math.min(d.startY, p.y),
        w: Math.abs(p.x - d.startX),
        h: Math.abs(p.y - d.startY),
      });
      return;
    }
    const dx = p.x - d.startX;
    const dy = p.y - d.startY;

    if (d.mode === 'move' && d.origins) {
      setBooths((all) => all.map((b) => {
        const o = d.origins![b.id];
        if (!o) return b;
        return {
          ...b,
          x: clamp(snap(o.x + dx, plan), 0, plan.width - b.w),
          y: clamp(snap(o.y + dy, plan), 0, plan.height - b.h),
        };
      }));
    } else if (d.mode === 'resize' && d.boothId && d.orig && d.handle) {
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
        setSelectedIds([b.id]);
        setTool('select');
      }
      setDrawDraft(null);
    }
    if (d?.mode === 'marquee' && marquee) {
      if (marquee.w < 6 && marquee.h < 6) {
        if (!d.shift) setSelectedIds([]);
      } else {
        const hit = booths
          .filter((b) => b.x < marquee.x + marquee.w && b.x + b.w > marquee.x && b.y < marquee.y + marquee.h && b.y + b.h > marquee.y)
          .map((b) => b.id);
        setSelectedIds((cur) => (d.shift ? [...new Set([...cur, ...hit])] : hit));
      }
      setMarquee(null);
    }
    drag.current = null;
  }

  // ----- persistence -------------------------------------------------
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
          setSelectedIds([]);
        }
        toast('Layout imported. Press "Save layout" to keep it.');
      } catch {
        toast('That file is not a valid floor plan export.', 'error');
      }
    };
    reader.readAsText(file);
  }

  function setOrientation(o: 'landscape' | 'portrait') {
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
            {toolBtn('select', <MousePointer2 className="h-4 w-4" />, 'Select, drag a box to select many')}
            {toolBtn('draw', <PenSquare className="h-4 w-4" />, 'Draw a booth')}
            {toolBtn('pan', <Hand className="h-4 w-4" />, 'Pan the canvas')}
          </div>
          <Button size="sm" variant="outline" icon={<Plus className="h-3.5 w-3.5" />} onClick={addBoothAtCenter}>Add booth</Button>
          <Button size="sm" variant="secondary" icon={<Sparkles className="h-3.5 w-3.5" />} onClick={() => setGenOpen(true)}>Generate…</Button>
          <div className="flex items-center gap-1">
            <button aria-label="Zoom out" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => setZoom((z) => clamp(z - 0.1, 0.2, 2))}><ZoomOut className="h-4 w-4" /></button>
            <span className="w-10 text-center text-xs text-slate-500">{Math.round(zoom * 100)}%</span>
            <button aria-label="Zoom in" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => setZoom((z) => clamp(z + 0.1, 0.2, 2))}><ZoomIn className="h-4 w-4" /></button>
            <button aria-label="Fit the whole plan on screen" title="Fit to screen" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={fitToScreen}><Maximize2 className="h-4 w-4" /></button>
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
        <div ref={scrollRef} className="h-[64vh] overflow-auto bg-slate-50 p-4">
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
            {plan.showGrid && <rect className="plan-grid" width={plan.width} height={plan.height} fill="url(#grid)" pointerEvents="none" />}

            {booths.map((b) => {
              const fill = boothFill(b.status, b.color);
              const text = contrastText(fill);
              const isSel = selectedIds.includes(b.id);
              const bookedFlag = b.status === 'booked' ? flagForText(b.booked_label) : '';
              const displayLabel = b.status === 'booked' && b.booked_label ? b.booked_label : b.label;
              const marker = isMarkerStatus(b.status);
              const markerIcon = boothStatusMeta[b.status].icon;
              const baseFont = b.font_size ?? Math.min(22, b.h / 3);
              const smallFont = b.font_size ? Math.max(9, b.font_size * 0.55) : Math.min(12, b.h / 5);
              const restricted = (b.allowed_types?.length ?? 0) > 0;
              return (
                <g key={b.id} opacity={b.hidden ? 0.35 : 1}>
                  <rect
                    x={b.x} y={b.y} width={b.w} height={b.h} rx={6}
                    fill={fill} fillOpacity={0.9}
                    stroke={isSel ? '#1a3c5e' : restricted ? '#b45309' : 'rgba(0,0,0,0.25)'}
                    strokeWidth={isSel ? 3 : restricted ? 2 : 1}
                    strokeDasharray={restricted && !isSel ? '6 3' : undefined}
                    className="booth-shape"
                    onPointerDown={(e) => onBoothPointerDown(e, b)}
                  />
                  {restricted && (
                    <circle cx={b.x + 10} cy={b.y + 10} r={5} fill="#F0B323" stroke="#b45309" strokeWidth={1} pointerEvents="none" />
                  )}
                  {marker ? (
                    <>
                      <text
                        x={b.x + b.w / 2} y={b.y + b.h / 2 + (b.label ? -2 : 8)}
                        textAnchor="middle" fontSize={b.font_size ?? Math.min(30, b.h / 2.2)} pointerEvents="none"
                      >
                        {markerIcon}
                      </text>
                      {b.label && (
                        <text
                          x={b.x + b.w / 2} y={b.y + b.h / 2 + Math.min(20, b.h / 3.2)}
                          textAnchor="middle" fontSize={smallFont} fontWeight={700}
                          fill={text} pointerEvents="none"
                        >
                          {b.label}
                        </text>
                      )}
                    </>
                  ) : (
                    <>
                      {bookedFlag && (
                        <text
                          x={b.x + b.w / 2} y={b.y + b.h / 2 - Math.min(10, b.h / 6)}
                          textAnchor="middle" fontSize={b.font_size ?? Math.min(26, b.h / 2.6)} pointerEvents="none"
                        >
                          {bookedFlag}
                        </text>
                      )}
                      <text
                        x={b.x + b.w / 2}
                        y={bookedFlag ? b.y + b.h / 2 + Math.min(10, b.h / 6) : b.y + b.h / 2 - (displayLabel ? 4 : -4)}
                        textAnchor="middle" fontSize={bookedFlag ? smallFont : baseFont} fontWeight={700}
                        fill={text} pointerEvents="none"
                      >
                        {bookedFlag ? (displayLabel.length > 16 ? `${displayLabel.slice(0, 15)}…` : displayLabel) : b.number}
                      </text>
                      {!bookedFlag && displayLabel && (
                        <text
                          x={b.x + b.w / 2} y={b.y + b.h / 2 + Math.min(16, b.h / 4)}
                          textAnchor="middle" fontSize={smallFont}
                          fill={text} pointerEvents="none"
                        >
                          {displayLabel.length > 18 ? `${displayLabel.slice(0, 17)}…` : displayLabel}
                        </text>
                      )}
                    </>
                  )}
                  {single?.id === b.id && (['nw', 'ne', 'sw', 'se'] as const).map((h) => (
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
            {marquee && (marquee.w > 2 || marquee.h > 2) && (
              <rect
                x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h}
                fill="#2f5d8a" fillOpacity={0.12} stroke="#2f5d8a" strokeDasharray="4 3" strokeWidth={1.5}
              />
            )}
          </svg>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
          <Legend entries={plan.legend} compact />
          <p className="text-xs text-slate-400">
            {booths.length} booths - drag on empty space to select a whole area, Shift+click to add one
          </p>
        </div>
      </Card>

      {/* Right panel */}
      <div className="space-y-4">
        {single ? (
          <BoothPropsPanel
            booth={single}
            vendorTypes={vendorTypes}
            onChange={(p) => patchBooth(single.id, p)}
            onDuplicate={duplicateSelected}
            onDelete={deleteSelected}
          />
        ) : selectedBooths.length > 1 ? (
          <MultiBoothPanel
            count={selectedBooths.length}
            vendorTypes={vendorTypes}
            canDistribute={selectedBooths.length >= 3}
            onAlign={arrange}
            onStatus={(status) => patchSelected({ status })}
            onAllowedTypes={(types) => patchSelected({ allowed_types: types.length > 0 ? types : null })}
            onGroup={(group) => patchSelected({ group_name: group || null })}
            onDuplicate={duplicateSelected}
            onDelete={deleteSelected}
          />
        ) : (
          <Card title="Booth designer">
            <ul className="list-inside space-y-2 text-sm text-slate-600">
              <li>Press <strong>Generate…</strong> to create all the booths you need in one go, then drag them into place.</li>
              <li>Drag on empty space to select a whole group, then move them together or use the arrange buttons.</li>
              <li>Click one booth to rename, renumber, colour, resize text, or limit who can select it.</li>
              <li>A gold dot with a dashed border marks booths limited to certain vendor types.</li>
              <li>Press <strong>Save layout</strong> when you are happy with the plan.</li>
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

      {/* Generate booths */}
      <Modal
        open={genOpen}
        onClose={() => setGenOpen(false)}
        title="Generate booths"
        footer={
          <>
            <Button variant="outline" onClick={() => setGenOpen(false)}>Cancel</Button>
            <Button icon={<Sparkles className="h-4 w-4" />} onClick={generateBooths}>Generate {clamp(genCount, 1, 200)} booths</Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="How many booths?">
            <Input type="number" min={1} max={200} value={genCount} onChange={(e) => setGenCount(Number(e.target.value) || 1)} />
          </Field>
          <Field label="Booths per row">
            <Input type="number" min={1} max={30} value={genCols} onChange={(e) => setGenCols(Number(e.target.value) || 1)} />
          </Field>
          <Field label="Booth width (px)">
            <Input type="number" min={24} value={genW} onChange={(e) => setGenW(Number(e.target.value) || 120)} />
          </Field>
          <Field label="Booth height (px)">
            <Input type="number" min={24} value={genH} onChange={(e) => setGenH(Number(e.target.value) || 80)} />
          </Field>
          <Field label="Gap between booths (px)">
            <Input type="number" min={0} value={genGap} onChange={(e) => setGenGap(Number(e.target.value) || 0)} />
          </Field>
          <Field label="Start numbering at">
            <Input type="number" min={1} value={genStart} onChange={(e) => setGenStart(Number(e.target.value) || 1)} />
          </Field>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          The booths appear in a grid at the top left, already numbered. Drag them (or select groups) into position, then press Save layout.
        </p>
      </Modal>
    </div>
  );
}
