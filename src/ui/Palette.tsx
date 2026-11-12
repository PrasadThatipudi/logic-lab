import { PALETTE } from '../domain/canvas.ts';
import { gateKey } from '../hooks/useShortcuts.ts';
import type { NodeType } from '../domain/types.ts';
import { GateShape } from './GateShape.tsx';

const TOOL_ICON: Partial<Record<NodeType, string>> = { INPUT: 'IN', OUTPUT: 'OUT' };

const GROUPS: { title: string; types: NodeType[] }[] = [
  { title: 'Inputs / Outputs', types: ['INPUT', 'OUTPUT'] },
  { title: 'Logic Gates', types: PALETTE.filter((t) => t !== 'INPUT' && t !== 'OUTPUT') },
];

export function Palette({ tool, onTool }: { tool: NodeType | null; onTool: (t: NodeType | null) => void }) {
  return (
    <aside id="palette" className="palette" aria-label="Gates">
      {GROUPS.map((g) => (
        <details key={g.title} open className="group">
          <summary>{g.title}</summary>
          <div className="group-grid">
            {g.types.map((t) => {
              const key = gateKey(PALETTE.indexOf(t));
              return (
                <button
                  key={t}
                  type="button"
                  data-type={t}
                  className={tool === t ? 'active' : ''}
                  aria-pressed={tool === t}
                  aria-keyshortcuts={key}
                  title={`${t} · press ${key}, or click, then click the canvas to place`}
                  onClick={() => onTool(tool === t ? null : t)}
                >
                  {TOOL_ICON[t]
                    ? <span className="tool">{TOOL_ICON[t]}</span>
                    : <svg viewBox="-2 -28 82 56"><GateShape type={t} /></svg>}
                  <span>{t}</span>
                  <kbd className="key">{key}</kbd>
                </button>
              );
            })}
          </div>
        </details>
      ))}
    </aside>
  );
}
