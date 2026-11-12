import { useEffect, useRef, useState } from 'react';
import { buildCircuit } from '../domain/circuit.ts';
import { addNode, disconnect, emptyModel, PALETTE, removeNode, renameNode } from '../domain/canvas.ts';
import { fromCircuit, toCircuit, toExpressions } from '../domain/convert.ts';
import { convertExpression, format } from '../domain/parser.ts';
import { parseTestFile, runTests } from '../domain/testcases.ts';
import type { EditorNode, NodeType, Style } from '../domain/types.ts';
import { storage, useStoredState } from '../hooks/useLocalStorage.ts';
import { useCircuit } from '../hooks/useCircuit.ts';
import { isTyping, useShortcuts } from '../hooks/useShortcuts.ts';
import { Canvas, type Selection } from './Canvas.tsx';
import { downloadCircuitSvg } from './exportSvg.ts';
import { Palette } from './Palette.tsx';
import { ShortcutsHelp } from './ShortcutsHelp.tsx';
import { type TestOutcome, TestsPanel } from './TestsPanel.tsx';
import { DEFAULT_VIEW, fitView, type View, ZOOM_STEP, zoomAt } from '../domain/view.ts';

type Theme = 'dark' | 'light';

const DEFAULT_EXPR = 'Y = AB + BC + AC';
const EXAMPLES: Record<Style, [string, string][]> = {
  algebra: [['AND', 'Y = AB'], ['OR', 'Y = A + B'], ['XOR', 'Y = A ^ B'], ['NAND', "Y = (AB)'"], ['Majority', 'Y = AB + BC + AC'], ['Half adder', 'S = A ^ B\nC = AB']],
  words: [['NAND', 'Y = A NAND B'], ['XOR', 'Y = A XOR B'], ['Mixed', 'Y = NOT (A AND B) OR (C NOR D)'], ['Half adder', 'S = A XOR B\nC = A AND B']],
};
const HINTS: Record<Style, string> = {
  algebra: "AB = AND · + = OR · ^ = XOR · ' or ! = NOT · ( ) = group",
  words: 'AND & * · OR | + · NOT ! ~ · NAND NOR XOR XNOR · ( ) = group',
};
const STYLE_LABEL: Record<Style, string> = { algebra: 'AB + C', words: 'AND / OR' };
const isStyle = (v: string): v is Style => v === 'algebra' || v === 'words';
const isTheme = (v: string): v is Theme => v === 'dark' || v === 'light';
const systemTheme = (): Theme => (globalThis.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark');

export function App() {
  const circuit = useCircuit();
  const [style, setStyle] = useStoredState<Style>('style', () => 'algebra', isStyle);
  const [theme, setTheme] = useStoredState<Theme>('theme', systemTheme, isTheme);
  const [expr, setExpr] = useState(() => {
    if (storage.get('canvas') && circuit.model.nodes.length) return exprFromModel(circuit.model, style);
    try { return convertExpression(DEFAULT_EXPR, 'algebra', style); } catch { return DEFAULT_EXPR; }
  });
  const [exprError, setExprError] = useState('');
  const [tool, setTool] = useState<NodeType | null>(null);
  const [selected, setSelected] = useState<Selection>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const stageRef = useRef<HTMLElement>(null);
  const exprRef = useRef<HTMLTextAreaElement>(null);
  const [testsText, setTestsText] = useState('');
  const [outcome, setOutcome] = useState<TestOutcome | null>(null);
  const typing = useRef<number | undefined>(undefined);

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  const fit = (nodes: EditorNode[] = circuit.current().nodes) => {
    const el = stageRef.current;
    if (el) setView(fitView(nodes, el.clientWidth, el.clientHeight));
  };
  const zoomBy = (factor: number) => {
    const el = stageRef.current;
    if (el) setView((v) => zoomAt(v, factor, el.clientWidth / 2, el.clientHeight / 2));
  };

  // the canvas is the source of truth: typing builds it, editing it rewrites the text
  const generate = (src: string, st: Style) => {
    if (!src.trim()) {
      circuit.replace(emptyModel());
      setExprError('');
      fit([]);
    } else {
      try {
        const values: Record<string, number> = {};
        for (const n of circuit.current().nodes) if (n.type === 'INPUT') values[n.name!] = n.value ?? 0;
        const built = fromCircuit(buildCircuit(src, st), values);
        circuit.replace(built);
        setExprError('');
        fit(built.nodes);
      } catch (e) {
        setExprError((e as Error).message);
        return;
      }
    }
    setOutcome(null);
  };

  useEffect(() => {
    if (!circuit.model.nodes.length) generate(expr, style);
    else fit();
    return () => clearTimeout(typing.current);
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncExpressionFromCanvas = () => {
    try {
      setExpr(exprFromModel(circuit.current(), style));
      setExprError('');
    } catch (e) {
      setExprError((e as Error).message);
    }
  };

  const onCanvasChange = () => {
    setOutcome(null);
    syncExpressionFromCanvas();
  };

  const onExprInput = (value: string) => {
    setExpr(value);
    clearTimeout(typing.current);
    typing.current = setTimeout(() => generate(value, style), 300) as unknown as number;
  };

  const chooseExample = (src: string) => {
    clearTimeout(typing.current);
    setExpr(src);
    generate(src, style);
  };

  const toggleStyle = () => {
    const next: Style = style === 'algebra' ? 'words' : 'algebra';
    try {
      setExpr(convertExpression(expr, style, next));
      setExprError('');
    } catch (err) {
      setExprError(`Could not convert to ${STYLE_LABEL[next]} notation: ${(err as Error).message}`);
      return;
    }
    setStyle(next);
  };

  const run = () => {
    try {
      const c = toCircuit(circuit.current());
      setOutcome({ summary: runTests(c, parseTestFile(testsText, c).cases) });
    } catch (e) {
      setOutcome({ error: (e as Error).message });
    }
  };

  const { model } = circuit;
  const canRun = model.nodes.some((n) => n.type === 'INPUT') && model.nodes.some((n) => n.type === 'OUTPUT') && !!testsText.trim();
  const otherStyle: Style = style === 'algebra' ? 'words' : 'algebra';
  const switchLabel = `Switch to ${STYLE_LABEL[otherStyle]} notation`;
  const themeLabel = `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`;

  // drop a stale selection after the model is replaced (e.g. a new expression was typed)
  const sel = selected && (selected.kind === 'node' ? model.nodes.some((n) => n.id === selected.id) : !!model.wires[selected.index])
    ? selected
    : null;
  const selectedNode = sel?.kind === 'node' ? model.nodes.find((n) => n.id === sel.id) : undefined;

  const renameNodeWithPrompt = (n: EditorNode) => {
    const name = prompt(`Rename ${n.type.toLowerCase()}`, n.name);
    if (name === null) return;
    try {
      circuit.edit((m) => renameNode(m, n.id, name.trim()));
      setExprError('');
    } catch (e) {
      setExprError((e as Error).message);
    }
    onCanvasChange();
  };

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  const afterHistoryStep = (changed: boolean) => {
    if (!changed) return;
    setOutcome(null);
    syncExpressionFromCanvas();
  };

  const deleteSelection = () => {
    if (!sel) return;
    circuit.edit((m) => (sel.kind === 'node' ? removeNode(m, sel.id) : disconnect(m, m.wires[sel.index])));
    setSelected(null);
    onCanvasChange();
  };
  const renameSelection = () => {
    if (selectedNode && (selectedNode.type === 'INPUT' || selectedNode.type === 'OUTPUT')) renameNodeWithPrompt(selectedNode);
  };
  const duplicateSelection = () => {
    if (!selectedNode) return;
    let id = -1;
    circuit.edit((m) => {
      const copy = addNode(m, selectedNode.type, selectedNode.x + 24, selectedNode.y + 24);
      if (selectedNode.type === 'CONST') copy.value = selectedNode.value;
      id = copy.id;
    });
    setSelected({ kind: 'node', id });
    onCanvasChange();
  };
  const exportSvg = () => {
    const svg = document.querySelector<SVGSVGElement>('#canvas svg');
    if (svg) downloadCircuitSvg(svg, circuit.current().nodes);
  };
  const clearTests = () => { setTestsText(''); setOutcome(null); };

  useShortcuts({
    focusEditor: () => exprRef.current?.focus(),
    runTests: () => { if (canRun) run(); },
    pickGate: (i) => setTool(tool === PALETTE[i] ? null : PALETTE[i]),
    escape: () => {
      if (helpOpen) setHelpOpen(false);
      else if (isTyping(document.activeElement)) (document.activeElement as HTMLElement).blur();
      else if (tool) setTool(null);
      else setSelected(null);
    },
    deleteSelection,
    rename: renameSelection,
    undo: () => afterHistoryStep(circuit.undo()),
    redo: () => afterHistoryStep(circuit.redo()),
    duplicate: duplicateSelection,
    fit: () => fit(),
    toggleTheme,
    toggleStyle,
    toggleHelp: () => setHelpOpen((open) => !open),
  });

  const selLabel = sel?.kind === 'wire' ? 'Wire' : selectedNode && `${selectedNode.type}${selectedNode.name ? ` ${selectedNode.name}` : ''}`;
  const renamable = selectedNode?.type === 'INPUT' || selectedNode?.type === 'OUTPUT';

  return (
    <>
      <header className="topbar">
        <div className="brand"><span className="logo">◧</span> LogicLab</div>
        <div className="formula">
          <textarea
            id="expr"
            ref={exprRef}
            rows={Math.min(6, Math.max(1, expr.split('\n').length))}
            aria-label="Boolean expressions, one output per line"
            aria-keyshortcuts="/ Control+K Meta+K"
            title="Focus with / or Ctrl/⌘+K"
            spellCheck={false}
            autoComplete="off"
            value={expr}
            placeholder={style === 'algebra' ? "e.g.  Y = AB + C'" : 'e.g.  Y = (A AND B) XOR NOT C'}
            aria-invalid={!!exprError}
            onChange={(e) => onExprInput(e.target.value)}
          />
          <span
            className={`live${exprError ? ' bad' : ''}`}
            title={exprError ? 'The expression has an error' : 'The circuit rebuilds as you type'}
          >
            {exprError ? '⚠ Invalid' : '✓ Auto-build'}
          </span>
        </div>
        <button type="button" id="style-toggle" className="style-btn" title={`${switchLabel} (Alt+N)`} aria-label={switchLabel} onClick={toggleStyle}>
          Notation ⇄ {STYLE_LABEL[otherStyle]}
        </button>
        <div className="tools">
          <button type="button" className="icon" aria-label="Undo" title="Undo (Ctrl/⌘+Z)" disabled={!circuit.canUndo} onClick={() => afterHistoryStep(circuit.undo())}>↶</button>
          <button type="button" className="icon" aria-label="Redo" title="Redo (Ctrl/⌘+Y)" disabled={!circuit.canRedo} onClick={() => afterHistoryStep(circuit.redo())}>↷</button>
          <button type="button" className="icon" aria-label="Fit to screen" title="Fit to screen (Ctrl/⌘+0)" disabled={!model.nodes.length} onClick={() => fit()}>⛶</button>
          <button type="button" className="icon" aria-label="Export circuit as SVG" title="Export circuit as SVG" disabled={!model.nodes.length} onClick={exportSvg}>⤓</button>
        </div>
        <button
          type="button"
          id="theme"
          className="icon"
          aria-label="Toggle light/dark mode"
          title={`${themeLabel} (Alt+L)`}
          onClick={toggleTheme}
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>
        <button type="button" id="help" className="icon" aria-label="Keyboard shortcuts" title="Syntax and keyboard shortcuts (?)" onClick={() => setHelpOpen(true)}>
          ?
        </button>
      </header>
      {exprError && <div id="expr-error" className="error-line" role="alert">{exprError}</div>}
      <div className="examples">
        <span>Try:</span>
        <span id="chips">
          {EXAMPLES[style].map(([label, src]) => (
            <button key={label} className="chip" onClick={() => chooseExample(src)}>{label}</button>
          ))}
        </span>
        <span className="hint" id="hint">
          <b>Syntax</b> <code>{HINTS[style]}</code>
          <button type="button" className="link" onClick={() => setHelpOpen(true)}>All operators</button>
        </span>
      </div>

      <main className="layout">
        <Palette tool={tool} onTool={setTool} />
        <section className="stage" aria-label="Circuit" ref={stageRef}>
          {!model.nodes.length && <div id="empty" className="empty">Type an expression, or pick a gate and click here to place it.</div>}
          <Canvas
            model={model}
            signals={circuit.signals}
            tool={tool}
            onTool={setTool}
            edit={circuit.edit}
            view={view}
            onView={setView}
            selected={sel}
            onSelect={setSelected}
            onRename={renameNodeWithPrompt}
            onChange={onCanvasChange}
            onError={setExprError}
          />
          {sel && (
            <div className="selbar" role="toolbar" aria-label="Selection actions">
              <span className="selname">{selLabel}</span>
              {renamable && <button type="button" onClick={renameSelection} title="Rename (R)">Rename</button>}
              {selectedNode && <button type="button" onClick={duplicateSelection} title="Duplicate (Ctrl/⌘+D)">Duplicate</button>}
              <button type="button" className="danger" onClick={deleteSelection} title="Delete (Del)">Delete</button>
            </div>
          )}
          <div className="zoombar" role="group" aria-label="Zoom">
            <button type="button" className="icon" aria-label="Zoom out" title="Zoom out" onClick={() => zoomBy(1 / ZOOM_STEP)}>−</button>
            <span className="zoomval" aria-live="polite">{Math.round(view.zoom * 100)}%</span>
            <button type="button" className="icon" aria-label="Zoom in" title="Zoom in" onClick={() => zoomBy(ZOOM_STEP)}>+</button>
            <button type="button" className="icon" aria-label="Fit circuit to screen" title="Fit to screen (Ctrl/⌘+0)" onClick={() => fit()}>⛶</button>
          </div>
          <div className="legend"><span className="k hi" />HIGH (1) <span className="k lo" />LOW (0)</div>
        </section>
        <TestsPanel
          text={testsText}
          onText={(t) => { setTestsText(t); setOutcome(null); }}
          canRun={canRun}
          onRun={run}
          onClear={clearTests}
          outcome={outcome}
        />
      </main>
      {helpOpen && <ShortcutsHelp onClose={() => setHelpOpen(false)} />}
    </>
  );
}

function exprFromModel(model: Parameters<typeof toExpressions>[0], style: Style): string {
  // feedback signals can have multi-letter names, which the compact algebra style can't express
  const line = (o: ReturnType<typeof toExpressions>[number]) => {
    try { return `${o.name} = ${format(o.ast, style)}`; } catch { return `${o.name} = ${format(o.ast, 'words')}`; }
  };
  return toExpressions(model).map(line).join('\n');
}
