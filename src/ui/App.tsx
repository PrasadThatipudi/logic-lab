import { useEffect, useRef, useState } from 'react';
import { buildCircuit } from '../domain/circuit.ts';
import { emptyModel } from '../domain/canvas.ts';
import { fromCircuit, toCircuit, toExpressions } from '../domain/convert.ts';
import { convertExpression, format } from '../domain/parser.ts';
import { parseTestFile, runTests } from '../domain/testcases.ts';
import type { NodeType, Style } from '../domain/types.ts';
import { storage, useStoredState } from '../hooks/useLocalStorage.ts';
import { useCircuit } from '../hooks/useCircuit.ts';
import { Canvas } from './Canvas.tsx';
import { Palette } from './Palette.tsx';
import { type TestOutcome, TestsPanel } from './TestsPanel.tsx';

type Theme = 'dark' | 'light';

const DEFAULT_EXPR = 'Y = AB + BC + AC';
const EXAMPLES: Record<Style, [string, string][]> = {
  algebra: [['AND', 'Y = AB'], ['OR', 'Y = A + B'], ['XOR', 'Y = A ^ B'], ['NAND', "Y = (AB)'"], ['Majority', 'Y = AB + BC + AC'], ['Half adder', 'S = A ^ B\nC = AB']],
  words: [['NAND', 'Y = A NAND B'], ['XOR', 'Y = A XOR B'], ['Mixed', 'Y = NOT (A AND B) OR (C NOR D)'], ['Half adder', 'S = A XOR B\nC = A AND B']],
};
const HINTS: Record<Style, string> = {
  algebra: "AB = AND · + = OR · ^ = XOR · ' or ! = NOT · parentheses · 0/1 · single-letter variables · one output per line",
  words: "Operators: AND & * · OR | + · NOT ! ~ ' · NAND NOR XOR ^ XNOR · parentheses · 0/1 · one output per line",
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
  const [testsText, setTestsText] = useState('');
  const [outcome, setOutcome] = useState<TestOutcome | null>(null);
  const typing = useRef<number | undefined>(undefined);

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  // the canvas is the source of truth: typing builds it, editing it rewrites the text
  const generate = (src: string, st: Style) => {
    if (!src.trim()) {
      circuit.replace(emptyModel());
      setExprError('');
    } else {
      try {
        const values: Record<string, number> = {};
        for (const n of circuit.current().nodes) if (n.type === 'INPUT') values[n.name!] = n.value ?? 0;
        circuit.replace(fromCircuit(buildCircuit(src, st), values));
        setExprError('');
      } catch (e) {
        setExprError((e as Error).message);
        return;
      }
    }
    setOutcome(null);
  };

  useEffect(() => {
    if (!circuit.model.nodes.length) generate(expr, style);
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

  return (
    <>
      <header className="topbar">
        <div className="brand"><span className="logo">◧</span> LogicLab</div>
        <div className="formula">
          <textarea
            id="expr"
            rows={Math.min(6, Math.max(1, expr.split('\n').length))}
            aria-label="Boolean expressions, one output per line"
            spellCheck={false}
            autoComplete="off"
            value={expr}
            placeholder={style === 'algebra' ? "e.g.  Y = AB + C'" : 'e.g.  Y = (A AND B) XOR NOT C'}
            onChange={(e) => onExprInput(e.target.value)}
          />
        </div>
        <button type="button" id="style-toggle" className="style-btn" title={switchLabel} aria-label={switchLabel} onClick={toggleStyle}>
          {STYLE_LABEL[otherStyle]}
        </button>
        <button
          type="button"
          id="theme"
          className="icon"
          aria-label="Toggle light/dark mode"
          title={themeLabel}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? '☀' : '☾'}
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
        <span className="hint" id="hint">{HINTS[style]}</span>
      </div>

      <main className="layout">
        <Palette tool={tool} onTool={setTool} />
        <section className="stage" aria-label="Circuit">
          {!model.nodes.length && <div id="empty" className="empty">Type an expression, or pick a gate and click here to place it.</div>}
          <Canvas
            model={model}
            signals={circuit.signals}
            tool={tool}
            onTool={setTool}
            edit={circuit.edit}
            onChange={onCanvasChange}
            onError={setExprError}
          />
          <div className="legend"><span className="k hi" />HIGH (1) <span className="k lo" />LOW (0)</div>
        </section>
        <TestsPanel
          text={testsText}
          onText={(t) => { setTestsText(t); setOutcome(null); }}
          canRun={canRun}
          onRun={run}
          outcome={outcome}
        />
      </main>
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
