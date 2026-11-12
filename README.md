# LogicLab

Boolean expressions and logic-gate circuits in one editor. Type an expression and gates are drawn;
edit the gates and the expression is rewritten. Feedback loops (SR latches) are supported.

Built with Deno, Vite, React and TypeScript.

```bash
deno task dev          # dev server on http://localhost:5199
deno task build        # production bundle in dist/
deno task preview      # serve the production bundle
deno task check        # type-check
deno task test         # domain tests (Deno) + component tests (Vitest)
```

## Keyboard shortcuts

Press `?` in the app for the full list. Ctrl and ⌘ are interchangeable.

| Key | Action |
|---|---|
| `/` or `Ctrl+K` | Focus the expression editor |
| `Ctrl+Enter` | Run tests |
| `1`–`0` | Pick a gate from the palette, then click the canvas |
| `Esc` | Leave a text box, cancel the gate, or deselect |
| `Delete` / `Backspace` | Delete the selected gate or wire |
| `R` / `F2` | Rename the selected input or output |
| `Ctrl+Z` / `Ctrl+Shift+Z` (or `Ctrl+Y`) | Undo / redo |
| `Ctrl+D` | Duplicate the selected gate |
| `Ctrl+0` | Fit the circuit to the screen |
| `Alt+L` / `Alt+N` | Toggle light/dark / switch notation |

Plain-key shortcuts are ignored while a text box has focus.

## Layout

- `src/domain/` – pure logic, no React: parser, circuit evaluation, canvas model, simulation, test-case runner
- `src/hooks/` – `useCircuit` (model + signals, latch state persists across edits), `useLocalStorage`
- `src/ui/` – React components (`App`, `Canvas`, `Palette`, `TestsPanel`, `GateShape`)
