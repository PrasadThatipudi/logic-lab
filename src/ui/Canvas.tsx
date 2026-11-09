import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { addNode, connect, disconnect, IN_X, inPins, OUT_X, outPin, removeNode, renameNode } from '../domain/canvas.ts';
import type { Bit, CanvasModel, EditorNode, NodeType, Signals } from '../domain/types.ts';
import { GateShape } from './GateShape.tsx';

const W = 2400, H = 1400, SNAP = 12;
const snap = (v: number) => Math.round(v / SNAP) * SNAP;
const cls = (v: Bit | undefined) => (v ? 'hi' : 'lo');
const spot = (p: Point) => ({ x: Math.max(0, snap(p.x - 32)), y: Math.max(24, snap(p.y)) });

interface Point { x: number; y: number }
type Selection = { kind: 'node'; id: number } | { kind: 'wire'; index: number } | null;
type Drag =
  | { kind: 'wire'; fromOutput: boolean; id: number; pin: number; start: Point }
  | { kind: 'move'; id: number; dx: number; dy: number; moved: boolean };

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
        <title>{n.type}</title>
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
      {content}
    </g>
  );
}

interface Props {
  model: CanvasModel;
  signals: Signals;
  tool: NodeType | null;
  onTool: (tool: NodeType | null) => void;
  edit: (fn: (draft: CanvasModel) => void) => void;
  /** called once a user gesture has finished and the model should be synced to the expression */
  onChange: () => void;
  onError: (message: string) => void;
}

export function Canvas({ model, signals, tool, onTool, edit, onChange, onError }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const [selected, setSelected] = useState<Selection>(null);
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
    return { x: (Number(e.clientX) || 0) - r.left, y: (Number(e.clientY) || 0) - r.top };
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
    } else setSelected(null);
    if (drag.current) e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) {
      if (tool) setCursor(spot(svgPoint(e)));
      return;
    }
    const p = svgPoint(e);
    if (d.kind === 'wire') setDraft((cur) => cur && { ...cur, end: p });
    else {
      const x = Math.max(0, snap(p.x - d.dx)), y = Math.max(24, snap(p.y - d.dy));
      const n = byId(d.id);
      if (x !== n.x || y !== n.y) {
        d.moved = true;
        edit((m) => { const t = m.nodes.find((q) => q.id === d.id)!; t.x = x; t.y = y; });
      }
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
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
    const name = prompt(`Rename ${n.type.toLowerCase()}`, n.name);
    if (name === null) return;
    attempt(() => edit((m) => renameNode(m, n.id, name.trim())));
    onChange();
  };

  const onContextMenu = (e: React.MouseEvent) => {
    if (!tool) return;
    e.preventDefault();
    onTool(null);
  };

  useEffect(() => {
    if (!tool) setCursor(null);
  }, [tool]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName ?? '')) return;
      if (e.key === 'Escape' && tool) { onTool(null); return; }
      if (!selected || !/^(Delete|Backspace)$/.test(e.key)) return;
      e.preventDefault();
      if (selected.kind === 'node') edit((m) => removeNode(m, selected.id));
      else edit((m) => disconnect(m, m.wires[selected.index]));
      setSelected(null);
      onChange();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  // drop a stale selection after the model is replaced (e.g. a new expression was typed)
  const live = selected && (selected.kind === 'node' ? model.nodes.some((n) => n.id === selected.id) : !!model.wires[selected.index]);
  const sel = live ? selected : null;

  const ghost: EditorNode | null = tool && cursor
    ? { id: -1, type: tool, x: cursor.x, y: cursor.y, name: tool === 'INPUT' ? '?' : tool === 'OUTPUT' ? 'Y' : '', value: 0 }
    : null;

  return (
    <div
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
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="application"
        aria-label="Circuit canvas"
      >
        <defs>
          <filter id="glow" filterUnits="userSpaceOnUse" x={-50} y={-50} width={W + 100} height={H + 100}>
            <feGaussianBlur stdDeviation={2.5} result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
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
      </svg>
    </div>
  );
}
