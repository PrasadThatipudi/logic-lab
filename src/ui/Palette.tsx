import { PALETTE } from '../domain/canvas.ts';
import { gateKey } from '../hooks/useShortcuts.ts';
import type { NodeType } from '../domain/types.ts';
import { GateShape } from './GateShape.tsx';

const TOOL_ICON: Partial<Record<NodeType, string>> = { INPUT: 'IN', OUTPUT: 'OUT' };

export function Palette({ tool, onTool }: { tool: NodeType | null; onTool: (t: NodeType | null) => void }) {
  return (
    <aside id="palette" className="palette" aria-label="Gates">
      {PALETTE.map((t, i) => (
        <button
          key={t}
          type="button"
          data-type={t}
          className={tool === t ? 'active' : ''}
          aria-pressed={tool === t}
          aria-keyshortcuts={gateKey(i)}
          title={`Press ${gateKey(i)}, or click, then click the canvas to place`}
          onClick={() => onTool(tool === t ? null : t)}
        >
          {TOOL_ICON[t]
            ? <span className="tool">{TOOL_ICON[t]}</span>
            : <svg viewBox="-2 -28 78 56"><GateShape type={t} /></svg>}
          {t}
        </button>
      ))}
    </aside>
  );
}
