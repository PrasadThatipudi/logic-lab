import { SHORTCUTS } from '../hooks/useShortcuts.ts';

const SYNTAX: [string, string, string][] = [
  ['AND', 'AB', 'A AND B  ·  A & B  ·  A * B'],
  ['OR', 'A + B', 'A OR B  ·  A | B  ·  A + B'],
  ['NOT', "A'  ·  !A", "NOT A  ·  !A  ·  ~A  ·  A'"],
  ['NAND', "(AB)'", 'A NAND B'],
  ['NOR', "(A + B)'", 'A NOR B'],
  ['XOR', 'A ^ B', 'A XOR B  ·  A ^ B'],
  ['XNOR', "(A ^ B)'", 'A XNOR B'],
];

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()}>
        <h2>Expression syntax</h2>
        <table className="syntax">
          <thead><tr><th>Operation</th><th>AB + C notation</th><th>AND / OR notation</th></tr></thead>
          <tbody>
            {SYNTAX.map(([op, a, w]) => (
              <tr key={op}><td>{op}</td><td><code>{a}</code></td><td><code>{w}</code></td></tr>
            ))}
          </tbody>
        </table>
        <p className="muted">Use parentheses to group, 0 / 1 as constants, and one output per line, e.g. <code>S = A ^ B</code>.</p>
        <h2>Keyboard shortcuts</h2>
        <table>
          <tbody>
            {SHORTCUTS.map((s) => (
              <tr key={s.keys}>
                <td><kbd>{s.keys}</kbd></td>
                <td>{s.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="primary" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
