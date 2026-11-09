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

## Layout

- `src/domain/` – pure logic, no React: parser, circuit evaluation, canvas model, simulation, test-case runner
- `src/hooks/` – `useCircuit` (model + signals, latch state persists across edits), `useLocalStorage`
- `src/ui/` – React components (`App`, `Canvas`, `Palette`, `TestsPanel`, `GateShape`)
