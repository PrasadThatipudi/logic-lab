import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { addNode, connect, IN_X, inPins, OUT_X, outPin, PALETTE } from '../domain/canvas.ts';
import { type View, zoomAt } from '../domain/view.ts';
import { gateKey } from '../hooks/useShortcuts.ts';
import type { Bit, CanvasModel, EditorNode, NodeType, Signals } from '../domain/types.ts';
import { GateShape } from './GateShape.tsx';

const SNAP = 12;
const snap = (v: number) => Math.round(v / SNAP) * SNAP;
const cls = (v: Bit | undefined) => (v ? 'hi' : 'lo');
const spot = (p: Point) => ({ x: Math.max(0, snap(p.x - 32)), y: Math.max(24, snap(p.y)) });

interface Point { x: number; y: number }
export type Selection = { kind: 'node'; id: number } | { kind: 'wire'; index: number } | null;
type Drag =
  | { kind: 'wire'; fromOutput: boolean; id: number; pin: number; start: Point }
  | { kind: 'move'; id: number; dx: number; dy: number; moved: boolean }
  | { kind: 'pan'; x: number; y: number; pan: Point };

const HIT: Partial<Record<NodeType, [number, number, number, number]>> = {
  INPUT: [-36, -18, 86, 36],
  CONST: [-4, -18, 54, 36],
  OUTPUT: [-4, -24, 64, 48],
};
const hitBox = (t: NodeType) => HIT[t] ?? [-4, -32, 72, 64];
const tipFor = (t: NodeType) => {
  const i = PALETTE.indexOf(t);
  return i < 0 ? t : `${t} · press ${gateKey(i)} to place`;
};

const wirePath = (a: Point, b: Point) => {
  const dx = Math.max(24, Math.abs(b.x - a.x) / 2);
  return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`;
};

function NodeView({ n, v, selected = false, ghost = false }: { n: EditorNode; v: Bit | undefined; selected?: boolean; ghost?: boolean }) {
  const ins = inPins(n);
  const hasOut = outPin(n) !== null;
  const pins = ins.map((p, k) => (
    <g key={k}>
      <circle className="pin-in" data-id={n.id} data-pin={k} cx={p.x} cy={p.y} r={10} />
      <circle className="pin-dot" cx={p.x} cy={p.y} r={4} />
    </g>
  ));
  const out = hasOut && (
    <g>
      <circle className="pout" data-id={n.id} cx={OUT_X} cy={0} r={10} />
      <circle className="pin-dot" cx={OUT_X} cy={0} r={4} />
    </g>
  );
  const val = v ?? 0;
  let content;
  if (n.type === 'INPUT' || n.type === 'CONST') {
    const toggle = n.type === 'INPUT';
    content = (
      <>
        <g
          className={`src ${toggle ? 'toggle' : 'const'} ${cls(v)}`}
          {...(toggle ? { role: 'switch', 'aria-checked': !!val, 'aria-label': `Input ${n.name}` } : {})}
        >
          {toggle && <text className="label" x={-8} y={5} textAnchor="end">{n.name}</text>}
          <rect className="sw" x={0} y={-14} width={48} height={28} rx={6} />
          <text className="swv" x={24} y={6} textAnchor="middle">{val}</text>
          <line className={`pin ${cls(v)}`} x1={48} y1={0} x2={OUT_X} y2={0} />
        </g>
        {out}
      </>
    );
  } else if (n.type === 'OUTPUT') {
    content = (
      <>
        <g className={`outlamp ${cls(v)}`}>
          <line className="pin lead" x1={IN_X} y1={0} x2={0} y2={0} />
          <line className={`pin ${cls(v)}`} x1={0} y1={0} x2={20} y2={0} />
          <circle cx={38} cy={0} r={18} />
          <text x={38} y={6} textAnchor="middle">{val}</text>
          <text className="label" x={38} y={-28} textAnchor="middle">{n.name}</text>
        </g>
        {pins}
      </>
    );
  } else {
    content = (
      <>
        <GateShape type={n.type} />
        {ins.map((p, k) => <line key={k} className="pin lead" x1={p.x} y1={p.y} x2={0} y2={p.y} />)}
        <line className={`pin ${cls(v)}`} x1={60} y1={0} x2={OUT_X} y2={0} />
        <text className="gname" x={n.type === 'NOT' ? 22 : 24} y={4}>{n.type}</text>
        <text className={`val ${cls(v)}`} x={66} y={-10}>{val}</text>
        {pins}
        {out}
      </>
    );
  }
  return (
    <g className={`enode${selected ? ' sel' : ''}${ghost ? ' ghost' : ''}`} data-id={n.id} data-type={n.type} transform={`translate(${n.x},${n.y})`}>
      <title>{tipFor(n.type)}</title>
      {!ghost && <rect className="hit" x={hitBox(n.type)[0]} y={hitBox(n.type)[1]} width={hitBox(n.type)[2]} height={hitBox(n.type)[3]} rx={8} />}
      {content}
    </g>
  );
}

interface Props {
  model: CanvasModel;
  signals: Signals;
  tool: NodeType | null;
  onTool: (tool: NodeType | null) => void;
  edit: (fn: (draft: CanvasModel) => void, record?: boolean) => void;
  view: View;
  onView: (view: View) => void;
  selected: Selection;
  onSelect: (selection: Selection) => void;
  onRename: (node: EditorNode) => void;
  /** called once a user gesture has finished and the model should be synced to the expression */
  onChange: () => void;
  onError: (message: string) => void;
}

export function Canvas({ model, signals, tool, onTool, edit, view, onView, selected: sel, onSelect: setSelected, onRename, onChange, onError }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [draft, setDraft] = useState<{ fromOutput: boolean; start: Point; end: Point } | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);

  const byId = (id: number) => model.nodes.find((n) => n.id === id)!;
  const pinPos = (id: number, pin: number): Point => {
    const n = byId(id), p = inPins(n)[pin];
    return { x: n.x + p.x, y: n.y + p.y };
  };
  const outPos = (id: number): Point => ({ x: byId(id).x + OUT_X, y: byId(id).y });

  const svgPoint = (e: { clientX: number; clientY: number }): Point => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: ((Number(e.clientX) || 0) - r.left - view.pan.x) / view.zoom, y: ((Number(e.clientY) || 0) - r.top - view.pan.y) / view.zoom };
  };

  const attempt = (fn: () => void) => {
    try { fn(); onError(''); } catch (err) { onError((err as Error).message); }
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button > 0) return; // main button only (button is undefined for synthetic test events)
    if (tool) {
      const at = spot(svgPoint(e));
      let id = -1;
      edit((m) => { id = addNode(m, tool, at.x, at.y).id; });
      setSelected({ kind: 'node', id });
      if (!e.shiftKey) onTool(null);
      onChange();
      return;
    }
    const el = e.target as Element;
    const pout = el.closest<SVGElement>('.pout');
    const pin = el.closest<SVGElement>('.pin-in');
    const hit = el.closest<SVGElement>('.wirehit');
    const node = el.closest<SVGElement>('.enode');
    if (pout) {
      const id = Number(pout.dataset.id);
      drag.current = { kind: 'wire', fromOutput: true, id, pin: 0, start: outPos(id) };
      setDraft({ fromOutput: true, start: outPos(id), end: svgPoint(e) });
      setSelected(null);
    } else if (pin) {
      const id = Number(pin.dataset.id), k = Number(pin.dataset.pin);
      drag.current = { kind: 'wire', fromOutput: false, id, pin: k, start: pinPos(id, k) };
      setDraft({ fromOutput: false, start: pinPos(id, k), end: svgPoint(e) });
      setSelected(null);
    } else if (hit) {
      setSelected({ kind: 'wire', index: Number(hit.dataset.wire) });
    } else if (node) {
      const n = byId(Number(node.dataset.id));
      const p = svgPoint(e);
      drag.current = { kind: 'move', id: n.id, dx: p.x - n.x, dy: p.y - n.y, moved: false };
      setSelected({ kind: 'node', id: n.id });
    } else {
      setSelected(null);
      drag.current = { kind: 'pan', x: e.clientX, y: e.clientY, pan: view.pan };
    }
    if (drag.current) e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) {
      if (tool) setCursor(spot(svgPoint(e)));
      return;
    }
    if (d.kind === 'pan') {
      onView({ zoom: view.zoom, pan: { x: d.pan.x + e.clientX - d.x, y: d.pan.y + e.clientY - d.y } });
      return;
    }
    const p = svgPoint(e);
    if (d.kind === 'wire') setDraft((cur) => cur && { ...cur, end: p });
    else {
      const x = Math.max(0, snap(p.x - d.dx)), y = Math.max(24, snap(p.y - d.dy));
      const n = byId(d.id);
      if (x !== n.x || y !== n.y) {
        const first = !d.moved;
        d.moved = true;
        edit((m) => { const t = m.nodes.find((q) => q.id === d.id)!; t.x = x; t.y = y; }, first);
      }
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (d.kind === 'pan') return;
    if (d.kind === 'wire') {
      setDraft(null);
      // a wire can start at an output and end on an input pin, or the other way round
      const under = document.elementFromPoint?.(e.clientX, e.clientY) ?? (e.target as Element);
      const target = (under as Element | null)?.closest?.<SVGElement>(d.fromOutput ? '.pin-in' : '.pout');
      if (target) {
        const [from, to, pin] = d.fromOutput
          ? [d.id, Number(target.dataset.id), Number(target.dataset.pin)]
          : [Number(target.dataset.id), d.id, d.pin];
        attempt(() => edit((m) => connect(m, from, to, pin)));
      }
    } else if (!d.moved && byId(d.id)?.type === 'INPUT') {
      edit((m) => { const t = m.nodes.find((q) => q.id === d.id)!; t.value = (t.value ? 0 : 1) as Bit; });
    }
    onChange();
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const node = (e.target as Element).closest<SVGElement>('.enode');
    const n = node && model.nodes.find((q) => q.id === Number(node.dataset.id));
    if (!n || !(n.type === 'INPUT' || n.type === 'OUTPUT')) return;
    onRename(n);
  };

  const onContextMenu = (e: React.MouseEvent) => {
    if (!tool) return;
    e.preventDefault();
    onTool(null);
  };

  useEffect(() => {
    if (!tool) setCursor(null);
  }, [tool]);

  // wheel: scroll pans, pinch / Ctrl+wheel zooms around the pointer (needs a non-passive listener to stop page zoom)
  const latest = useRef({ view, onView });
  latest.current = { view, onView };
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { view: v, onView: set } = latest.current;
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect();
        set(zoomAt(v, Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top));
      } else set({ zoom: v.zoom, pan: { x: v.pan.x - e.deltaX, y: v.pan.y - e.deltaY } });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const ghost: EditorNode | null = tool && cursor
    ? { id: -1, type: tool, x: cursor.x, y: cursor.y, name: tool === 'INPUT' ? '?' : tool === 'OUTPUT' ? 'Y' : '', value: 0 }
    : null;

  return (
    <div
      ref={canvasRef}
      id="canvas"
      className={tool ? 'placing' : ''}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => { if (tool && !drag.current) setCursor(null); }}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      <svg
        ref={svgRef}
        className={draft ? (draft.fromOutput ? 'wiring' : 'wiring-rev') : ''}
        xmlns="http://www.w3.org/2000/svg"
        width="100%"
        height="100%"
        role="application"
        aria-label="Circuit canvas"
        data-zoom={view.zoom}
      >
        <defs>
          <filter id="glow" filterUnits="userSpaceOnUse" x={-2000} y={-2000} width={12000} height={8000}>
            <feGaussianBlur stdDeviation={2.5} result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <pattern id="grid" width={24} height={24} patternUnits="userSpaceOnUse" patternTransform={`translate(${view.pan.x} ${view.pan.y}) scale(${view.zoom})`}>
            <path className="gridline" d="M24 0H0V24" fill="none" />
          </pattern>
        </defs>
        <rect className="gridfill" width="100%" height="100%" fill="url(#grid)" />
        <g id="circuit-content" transform={`translate(${view.pan.x} ${view.pan.y}) scale(${view.zoom})`}>
        {model.wires.map((w, i) => {
          const d = wirePath(outPos(w.from), pinPos(w.to, w.pin));
          const isSel = sel?.kind === 'wire' && sel.index === i ? ' sel' : '';
          return (
            <g key={`${w.from}-${w.to}-${w.pin}`}>
              <path className={`wire ${cls(signals.get(w.from))}${isSel}`} d={d} />
              <path className="wirehit" data-wire={i} d={d} />
            </g>
          );
        })}
        {draft && <path className="wire draft" d={draft.fromOutput ? wirePath(draft.start, draft.end) : wirePath(draft.end, draft.start)} />}
        {model.nodes.map((n) => (
          <NodeView key={n.id} n={n} v={signals.get(n.id)} selected={sel?.kind === 'node' && sel.id === n.id} />
        ))}
        {ghost && <NodeView n={ghost} v={0} ghost />}
        </g>
      </svg>
    </div>
  );
}
