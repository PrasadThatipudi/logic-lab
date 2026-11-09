import { assert, assertEquals, assertMatch, assertThrows } from '@std/assert';
import { buildCircuit, evaluateOutput, evaluateOutputs } from './circuit.ts';
import { parseTestFile, runTests } from './testcases.ts';
import { convertExpression, format } from './parser.ts';
import { addNode, connect, emptyModel, renameNode } from './canvas.ts';
import { simulate } from './simulate.ts';
import { fromCircuit, toCircuit, toExpressions } from './convert.ts';
import type { Bit, CanvasModel, Signals } from './types.ts';

const throwsLike = (fn: () => unknown, re: RegExp) => {
  assertThrows(fn);
  try { fn(); } catch (e) { assertMatch((e as Error).message, re); }
};

const out = (expr: string, v: Record<string, Bit>) => evaluateOutput(buildCircuit(expr), v);

Deno.test('operators and precedence', () => {
  assertEquals(out('A AND B OR C', { A: 0, B: 0, C: 1 }), 1);
  assertEquals(out('A | B & C', { A: 0, B: 1, C: 0 }), 0);
  assertEquals(out('A NAND B', { A: 1, B: 1 }), 0);
  assertEquals(out('A NOR B', { A: 0, B: 0 }), 1);
  assertEquals(out('A XOR B', { A: 1, B: 0 }), 1);
  assertEquals(out('A XNOR B', { A: 1, B: 0 }), 0);
  assertEquals(out("!(A)' ", { A: 1 }), 1);
  assertEquals(out('~A + 0', { A: 0 }), 1);
});

Deno.test('output name and input order', () => {
  const c = buildCircuit('S = (B ^ A) ^ C');
  assertEquals(c.outputName, 'S');
  assertEquals(c.inputs, ['B', 'A', 'C']);
});

Deno.test('parse errors are meaningful', () => {
  throwsLike(() => buildCircuit(''), /empty/);
  throwsLike(() => buildCircuit('(A AND B'), /Missing closing/);
  throwsLike(() => buildCircuit('A AND'), /Expected an operand/);
  throwsLike(() => buildCircuit('A B'), /expected an operator/);
  throwsLike(() => buildCircuit('A $ B'), /Unexpected character/);
  throwsLike(() => buildCircuit('A AND ) B'), /Expected an operand/);
  throwsLike(() => buildCircuit('()'), /Empty parentheses/);
});

Deno.test('csv tests: pass, fail, invalid rows keep running', () => {
  const c = buildCircuit('Y = A AND B');
  const csv = 'id,A,B,Y\nt1,0,0,0\nt2,1,1,0\n# comment\nt3,1,x,0\nt4,1,1,1\n';
  const r = runTests(c, parseTestFile(csv, c).cases);
  assertEquals([r.total, r.passed, r.failed, r.invalid], [4, 2, 1, 1]);
  assertEquals(r.results[1], { id: 't2', status: 'fail', inputs: { A: 1, B: 1 }, expected: { Y: 0 }, actual: { Y: 1 }, wrong: ['Y'] });
});

Deno.test('json tests and file-level errors', () => {
  const c = buildCircuit('Y = A OR B');
  const r = runTests(c, parseTestFile('[{"id":"a","inputs":{"A":1,"B":0},"expected":1},{"A":0,"Y":0}]', c).cases);
  assertEquals([r.passed, r.invalid], [1, 1]);
  throwsLike(() => parseTestFile('', c), /empty/);
  throwsLike(() => parseTestFile('[oops', c), /Invalid JSON/);
  throwsLike(() => parseTestFile('A,Y\n1,1', c), /Missing input column "B"/);
  throwsLike(() => parseTestFile('A,B,Z,Y\n1,1,1,1', c), /Unknown column "Z"/);
  throwsLike(() => parseTestFile('A,B\n1,1', c), /expected-output column/);
});

const alg = (expr: string, v: Record<string, Bit>) => evaluateOutput(buildCircuit(expr, 'algebra'), v);

Deno.test('algebra style: juxtaposition is AND, AB is two inputs', () => {
  const c = buildCircuit('Y = AB', 'algebra');
  assertEquals(c.inputs, ['A', 'B']);
  assertEquals(alg('Y = AB', { A: 1, B: 1 }), 1);
  assertEquals(alg('AB + BC + AC', { A: 1, B: 0, C: 1 }), 1);
  assertEquals(alg('AB + BC + AC', { A: 1, B: 0, C: 0 }), 0);
  assertEquals(alg("A'B", { A: 0, B: 1 }), 1);
  assertEquals(alg("(A + B)'", { A: 0, B: 0 }), 1);
  assertEquals(alg('(A + B)(C + D)', { A: 1, B: 0, C: 0, D: 1 }), 1);
  assertEquals(alg('A ^ BC', { A: 1, B: 1, C: 1 }), 0);
  assertEquals(buildCircuit('Out = AB', 'algebra').outputName, 'Out');
});

Deno.test('words style still treats AB as one variable', () => {
  assertEquals(buildCircuit('Y = AB').inputs, ['AB']);
});

Deno.test('converting between styles keeps the truth table', () => {
  for (const e of ['Y = (A AND B) XOR NOT C', 'Y = NOT (A AND B) OR (C NOR D)', 'S = A XNOR B NAND C', 'Y = NOT NOT A']) {
    const a = convertExpression(e, 'words', 'algebra');
    const back = convertExpression(a, 'algebra', 'words');
    const w = buildCircuit(e), g = buildCircuit(a, 'algebra'), r = buildCircuit(back);
    assertEquals(g.inputs.sort(), w.inputs.sort());
    for (let i = 0; i < 1 << w.inputs.length; i++) {
      const v = Object.fromEntries(w.inputs.map((n, k) => [n, (i >> k) & 1]));
      assertEquals(evaluateOutput(g, v), evaluateOutput(w, v), a);
      assertEquals(evaluateOutput(r, v), evaluateOutput(w, v), back);
    }
  }
  assertEquals(convertExpression('Y = AB + BC + AC', 'algebra', 'words'), 'Y = A AND B OR B AND C OR A AND C');
  throwsLike(() => convertExpression('Y = price AND qty', 'words', 'algebra'), /single-letter/);
});

Deno.test('text test cases: A=0,B=1->Y=0 lines', () => {
  const c = buildCircuit('Y = AB', 'algebra');
  const text = 'A=0,B=0->Y=0\n# note\nA=1,B=1 -> Y=1\nA=1,B=1=>Y=0\nA=1,B=1->1\nA=1->Y=1\nA=1,Z=1,B=0->Y=0\nA=1,B=0\nA=1,B=0->Q=0';
  const r = runTests(c, parseTestFile(text, c).cases);
  assertEquals([r.total, r.passed, r.failed, r.invalid], [8, 3, 1, 4]);
  assertMatch(r.results[4].error!, /Line 6: missing input "B"/);
  assertMatch(r.results.at(-1)!.error!, /unknown output "Q"/);
  throwsLike(() => parseTestFile('# only a comment ->', c), /No test cases/);
});

Deno.test('multiple outputs share inputs', () => {
  const c = buildCircuit('S = A ^ B\nC = AB', 'algebra');
  assertEquals(c.inputs, ['A', 'B']);
  assertEquals(c.outputs.map((o) => o.name), ['S', 'C']);
  assertEquals(evaluateOutputs(c, { A: 1, B: 1 }), { S: 0, C: 1 });
  assertEquals(evaluateOutputs(buildCircuit('S = A ^ B; C = AB', 'algebra'), { A: 1, B: 0 }), { S: 1, C: 0 });
  const unnamed = buildCircuit('A\nB', 'algebra');
  assertEquals(unnamed.outputs.map((o) => o.name), ['Y', 'Y2']);
  throwsLike(() => buildCircuit('Y = A\nY = B', 'algebra'), /more than once/);
  throwsLike(() => buildCircuit('Y = A\nZ = B +', 'algebra'), /Output 2:/);
});

Deno.test('multi-output tests: lines, csv, json', () => {
  const c = buildCircuit('S = A ^ B\nC = AB', 'algebra');
  const lines = runTests(c, parseTestFile('A=1,B=1->S=0,C=1\nA=1,B=0->S=1,C=1\nA=1,B=0->S=1', c).cases);
  assertEquals([lines.passed, lines.failed, lines.invalid], [1, 1, 1]);
  assertEquals(lines.results[1].wrong, ['C']);
  const csv = runTests(c, parseTestFile('id,A,B,S,C\nx,1,1,0,1\ny,0,1,1,0', c).cases);
  assertEquals([csv.passed, csv.failed], [2, 0]);
  throwsLike(() => parseTestFile('A,B,S\n1,1,0', c), /expected-output column found for "C"/);
  const json = runTests(c, parseTestFile('[{"inputs":{"A":1,"B":1},"expected":{"S":0,"C":1}},{"A":0,"B":0,"S":0,"C":0}]', c).cases);
  assertEquals([json.passed, json.invalid], [2, 0]);
});

function halfAdder() {
  const m = emptyModel();
  const a = addNode(m, 'INPUT', 0, 24), b = addNode(m, 'INPUT', 0, 96);
  const x = addNode(m, 'XOR', 120, 48), n = addNode(m, 'AND', 120, 120);
  const s = addNode(m, 'OUTPUT', 300, 48), c = addNode(m, 'OUTPUT', 300, 120);
  renameNode(m, s.id, 'S'); renameNode(m, c.id, 'C');
  connect(m, a.id, x.id, 0); connect(m, b.id, x.id, 1);
  connect(m, a.id, n.id, 0); connect(m, b.id, n.id, 1);
  connect(m, x.id, s.id, 0); connect(m, n.id, c.id, 0);
  return { m, a, b };
}

Deno.test('canvas circuit converts and passes the test runner', () => {
  const { m } = halfAdder();
  const c = toCircuit(m);
  assertEquals(c.inputs, ['A', 'B']);
  const text = 'A=0,B=0->S=0,C=0\nA=1,B=0->S=1,C=0\nA=1,B=1->S=0,C=1';
  const r = runTests(c, parseTestFile(text, c).cases);
  assert(r.results.every((x) => x.status === 'pass'));
});

Deno.test('canvas simulate, loop and unconnected checks', () => {
  const { m, a, b } = halfAdder();
  a.value = 1; b.value = 1;
  const v = simulate(m);
  assertEquals(v.get(m.nodes.find((n) => n.name === 'C')!.id), 1);
  const x = m.nodes.find((n) => n.type === 'XOR');
  const g = addNode(m, 'AND3', 0, 0);
  const o = addNode(m, 'OUTPUT', 0, 0);
  connect(m, g.id, o.id, 0);
  throwsLike(() => toCircuit(m), /unconnected/);
  throwsLike(() => renameNode(m, a.id, 'B'), /already used/);
});

Deno.test('expression -> canvas -> expression round trip', () => {
  const src = 'S = A ^ B\nC = AB';
  const m = fromCircuit(buildCircuit(src, 'algebra'), { A: 1 });
  assertEquals(m.nodes.find((n) => n.name === 'A')!.value, 1);
  const text = toExpressions(m).map((o) => `${o.name} = ${format(o.ast, 'algebra')}`).join('\n');
  assertEquals(text, src);
  const c = toCircuit(m);
  assertEquals(evaluateOutputs(c, { A: 1, B: 1 }).C, 1);
});

Deno.test('AND3 and unfinished outputs in expression sync', () => {
  const m = emptyModel();
  const [a, b, c] = ['A', 'B', 'C'].map((_, i) => addNode(m, 'INPUT', 0, 24 + i * 48));
  const g = addNode(m, 'AND3', 100, 48), o = addNode(m, 'OUTPUT', 300, 48);
  connect(m, a.id, g.id, 0); connect(m, b.id, g.id, 1);
  connect(m, g.id, o.id, 0);
  assertEquals(toExpressions(m).length, 0);
  connect(m, c.id, g.id, 2);
  assertEquals(format(toExpressions(m)[0].ast, 'algebra'), 'ABC');
});

Deno.test('SR latch holds state and is excluded from truth-table tests', () => {
  const m = emptyModel();
  const sIn = addNode(m, 'INPUT', 0, 0), rIn = addNode(m, 'INPUT', 0, 100);
  const g1 = addNode(m, 'NOR', 100, 0), g2 = addNode(m, 'NOR', 100, 100);
  const q = addNode(m, 'OUTPUT', 300, 0);
  connect(m, rIn.id, g1.id, 0); connect(m, g2.id, g1.id, 1);
  connect(m, sIn.id, g2.id, 1); connect(m, g1.id, g2.id, 0);
  connect(m, g1.id, q.id, 0);
  let sig: Signals = new Map();
  const qv = () => { sig = simulate(m, sig); return sig.get(q.id); };
  const step = (S: Bit, R: Bit) => { sIn.value = S; rIn.value = R; return qv(); };
  assertEquals(step(1, 0), 1); // set
  assertEquals(step(0, 0), 1); // hold
  assertEquals(step(0, 1), 0); // reset
  assertEquals(step(0, 0), 0); // hold
  throwsLike(() => toCircuit(m), /feedback loop/);
  const eq = toExpressions(m);
  assertEquals(eq.length, 1);
  assertMatch(format(eq[0].ast, 'words'), /NOR.*\bY\b/);
});

Deno.test('latch equations typed as an expression become a feedback circuit', () => {
  const src = 'Q = (R NOR (S NOR Q))';
  const m = fromCircuit(buildCircuit(src, 'words'));
  assertEquals(m.nodes.filter((n) => n.type === 'NOR').length, 2);
  assertEquals(m.nodes.filter((n) => n.type === 'INPUT').map((n) => n.name).sort(), ['R', 'S']);
  let sig: Signals = new Map();
  const set = (S: Bit, R: Bit) => { m.nodes.find((n) => n.name === 'S')!.value = S; m.nodes.find((n) => n.name === 'R')!.value = R; sig = simulate(m, sig); return sig.get(m.nodes.find((n) => n.type === 'OUTPUT')!.id); };
  assertEquals(set(1, 0), 1);
  assertEquals(set(0, 0), 1);
  assertEquals(set(0, 1), 0);
  assertEquals(set(0, 0), 0);
  throwsLike(() => fromCircuit(buildCircuit('A = A', 'words')), /only feeds back/);
});
