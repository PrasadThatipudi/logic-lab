import { SHORTCUTS } from '../hooks/useShortcuts.ts';

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()}>
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
