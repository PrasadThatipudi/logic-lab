import { useEffect, useRef } from 'react';

export interface ShortcutActions {
  focusEditor: () => void;
  runTests: () => void;
  /** zero-based index into the palette */
  pickGate: (index: number) => void;
  escape: () => void;
  deleteSelection: () => void;
  rename: () => void;
  undo: () => void;
  redo: () => void;
  duplicate: () => void;
  fit: () => void;
  toggleTheme: () => void;
  toggleStyle: () => void;
  toggleHelp: () => void;
}

export const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: '/  or  Ctrl/⌘+K', action: 'Focus the expression editor' },
  { keys: 'Ctrl/⌘+Enter', action: 'Run tests' },
  { keys: '1 – 0', action: 'Pick a gate from the palette, then click the canvas' },
  { keys: 'Esc', action: 'Leave a text box, cancel the gate, or deselect' },
  { keys: 'Delete  /  Backspace', action: 'Delete the selected gate or wire' },
  { keys: 'R  or  F2', action: 'Rename the selected input or output' },
  { keys: 'Ctrl/⌘+Z', action: 'Undo' },
  { keys: 'Ctrl/⌘+Shift+Z  or  Ctrl/⌘+Y', action: 'Redo' },
  { keys: 'Ctrl/⌘+D', action: 'Duplicate the selected gate' },
  { keys: 'Ctrl/⌘+0', action: 'Fit the circuit to the screen' },
  { keys: 'Scroll  /  drag background', action: 'Pan the canvas (Ctrl/⌘+scroll or pinch to zoom)' },
  { keys: 'Alt+L', action: 'Toggle light/dark mode' },
  { keys: 'Alt+N', action: 'Switch notation' },
  { keys: '?', action: 'Show or hide this help' },
];

/** The key that picks palette entry `index`: 1–9, then 0 for the tenth. */
export const gateKey = (index: number) => String((index + 1) % 10);

export const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);

/** Maps a key press to an action, or null when it isn't a shortcut. Plain keys are ignored while typing. */
export function matchShortcut(e: KeyboardEvent, typing: boolean): ((a: ShortcutActions) => void) | null {
  const key = e.key.toLowerCase();
  const mod = e.ctrlKey || e.metaKey;

  // Option changes the typed character on macOS, so match the physical key
  if (e.altKey && !mod) {
    if (e.code === 'KeyL') return (a) => a.toggleTheme();
    if (e.code === 'KeyN') return (a) => a.toggleStyle();
    return null;
  }
  if (mod) {
    if (e.altKey) return null;
    if (key === 'k') return (a) => a.focusEditor();
    if (key === 'enter') return (a) => a.runTests();
    if (key === '0') return (a) => a.fit();
    if (typing) return null; // leave the browser's own text undo/redo alone
    if (key === 'z') return e.shiftKey ? (a) => a.redo() : (a) => a.undo();
    if (key === 'y') return (a) => a.redo();
    if (key === 'd') return (a) => a.duplicate();
    return null;
  }
  if (key === 'escape') return (a) => a.escape();
  if (typing) return null;
  if (key === '/') return (a) => a.focusEditor();
  if (key === '?') return (a) => a.toggleHelp();
  if (key === 'delete' || key === 'backspace') return (a) => a.deleteSelection();
  if (key === 'f2' || key === 'r') return (a) => a.rename();
  if (/^[0-9]$/.test(key)) return (a) => a.pickGate((Number(key) + 9) % 10);
  return null;
}

export function useShortcuts(actions: ShortcutActions) {
  const latest = useRef(actions);
  useEffect(() => { latest.current = actions; });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const run = matchShortcut(e, isTyping(e.target));
      if (!run) return;
      e.preventDefault();
      run(latest.current);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}
