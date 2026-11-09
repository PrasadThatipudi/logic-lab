import { addNode, arity, emptyModel } from './canvas.ts';
import { hasLoop } from './simulate.ts';
import type { Bit, CanvasModel, Circuit, CircuitNode, EditorNode, Expr, GateType } from './types.ts';

/**
 * Converts the drawn circuit into the netlist used by the test runner.
 * Throws if an output is missing, a pin is unconnected, or the circuit has a feedback loop.
 */
export function toCircuit(model: CanvasModel): Circuit {
  if (hasLoop(model)) throw new Error('This circuit has a feedback loop (latch). Watch it on the canvas; truth-table tests only cover circuits without loops.');
  const inputsN = model.nodes.filter((n) => n.type === 'INPUT');
  const outsN = model.nodes.filter((n) => n.type === 'OUTPUT');
  if (!inputsN.length) throw new Error('Add at least one INPUT');
  if (!outsN.length) throw new Error('Add at least one OUTPUT');
  for (const n of model.nodes) {
    for (let k = 0; k < arity(n.type); k++) {
      if (!model.wires.some((w) => w.to === n.id && w.pin === k)) {
        throw new Error(`${n.name || n.type} has an unconnected input${arity(n.type) > 1 ? ` (pin ${k + 1})` : ''}`);
      }
    }
  }
  const byId = new Map(model.nodes.map((n) => [n.id, n]));
  const source = (n: EditorNode, pin: number) => byId.get(model.wires.find((x) => x.to === n.id && x.pin === pin)!.from)!;
  const nodes: CircuitNode[] = [];
  const idOf = new Map<number, number>();
  const add = (n: EditorNode): number => {
    const known = idOf.get(n.id);
    if (known !== undefined) return known;
    let out: Omit<CircuitNode, 'id'>;
    if (n.type === 'INPUT') out = { kind: 'input', name: n.name, inputs: [] };
    else if (n.type === 'CONST') out = { kind: 'const', value: n.value, name: String(n.value), inputs: [] };
    else {
      const srcs = Array.from({ length: arity(n.type) }, (_, k) => add(source(n, k)));
      out = { kind: 'gate', type: n.type as GateType, inputs: srcs };
    }
    nodes.push({ ...out, id: nodes.length });
    idOf.set(n.id, nodes.length - 1);
    return nodes.length - 1;
  };
  inputsN.forEach(add);
  const outputs = outsN.map((o) => ({ name: o.name!, id: add(source(o, 0)) }));
  return { nodes, outputs, inputs: inputsN.map((n) => n.name!), outId: outputs[0].id, outputName: outputs[0].name };
}

/** Lays an expression-built circuit out as editable canvas nodes. `values` keeps input states by name. */
export function fromCircuit(circuit: Circuit, values: Record<string, number> = {}): CanvasModel {
  const model = emptyModel();
  const SLOT = 72, TOP = 60, SRC_X = 40, GATE_X = 190, COL = 170;
  const level = new Map<number, number>(), gy = new Map<number, number>();
  let slot = 0;
  const place = (id: number): number => {
    const n = circuit.nodes[id];
    if (n.kind !== 'gate') { level.set(id, 0); return TOP + slot++ * SLOT; }
    const ys = n.inputs.map(place);
    level.set(id, 1 + Math.max(...n.inputs.map((i) => level.get(i)!)));
    const y = ys.reduce((a, b) => a + b, 0) / ys.length;
    gy.set(id, y);
    return y;
  };
  const outYs = circuit.outputs.map((o) => place(o.id));
  // a variable named like an output is that output's signal fed back (latches), not a real input
  const driverOf = new Map(circuit.outputs.map((o) => [o.name, o.id]));
  const isFeedback = (n: CircuitNode) => n.kind === 'input' && driverOf.has(n.name!);
  const sources = circuit.nodes.filter((n) => n.kind !== 'gate' && !isFeedback(n));
  const span = Math.max(slot - 1, 0) * SLOT;
  const srcY = new Map(sources.map((n, i) => [n.id, TOP + (sources.length === 1 ? span / 2 : (span * i) / (sources.length - 1))]));
  const maxLv = Math.max(0, ...level.values());
  const made = new Map<number, EditorNode>();
  for (const n of circuit.nodes) {
    if (isFeedback(n)) continue;
    let node: EditorNode;
    if (n.kind === 'input') { node = addNode(model, 'INPUT', SRC_X, srcY.get(n.id)!); node.name = n.name; node.value = values[n.name!] ? 1 : 0; }
    else if (n.kind === 'const') { node = addNode(model, 'CONST', SRC_X, srcY.get(n.id)!); node.value = n.value; }
    else node = addNode(model, n.type!, GATE_X + (level.get(n.id)! - 1) * COL, Math.round(gy.get(n.id)!));
    made.set(n.id, node);
  }
  const resolve = (n: CircuitNode, depth = 0): EditorNode => {
    if (!isFeedback(n)) return made.get(n.id)!;
    if (depth > circuit.outputs.length) throw new Error(`Output "${n.name}" only feeds back on itself`);
    return resolve(circuit.nodes[driverOf.get(n.name!)!], depth + 1);
  };
  const outX = maxLv ? GATE_X + (maxLv - 1) * COL + COL : GATE_X;
  for (const n of circuit.nodes) {
    if (isFeedback(n)) continue;
    n.inputs.forEach((src, k) => model.wires.push({ from: resolve(circuit.nodes[src]).id, to: made.get(n.id)!.id, pin: k }));
  }
  circuit.outputs.forEach((o, i) => {
    const node = addNode(model, 'OUTPUT', outX, Math.round(circuit.nodes[o.id].kind === 'gate' ? outYs[i] : srcY.get(o.id)!));
    node.name = o.name;
    model.wires.push({ from: resolve(circuit.nodes[o.id]).id, to: node.id, pin: 0 });
  });
  return model;
}

/** Expression ASTs (for parser.format) of every fully wired OUTPUT, ordered top to bottom. */
export function toExpressions(model: CanvasModel): { name: string; ast: Expr }[] {
  const byId = new Map(model.nodes.map((n) => [n.id, n]));
  const path = new Set<number>();
  const loopName = (n: EditorNode) => {
    const w = model.wires.find((x) => x.from === n.id && byId.get(x.to)!.type === 'OUTPUT');
    return w ? byId.get(w.to)!.name! : `Q${n.id}`;
  };
  const build = (n: EditorNode): Expr | null => {
    if (path.has(n.id)) return { type: 'VAR', name: loopName(n) }; // feedback: refer to the signal by name
    if (n.type === 'INPUT') return { type: 'VAR', name: n.name! };
    if (n.type === 'CONST') return { type: 'CONST', value: (n.value ?? 0) as Bit };
    const args: Expr[] = [];
    path.add(n.id);
    for (let k = 0; k < arity(n.type); k++) {
      const w = model.wires.find((x) => x.to === n.id && x.pin === k);
      const a = w && build(byId.get(w.from)!);
      if (!a) { path.delete(n.id); return null; }
      args.push(a);
    }
    path.delete(n.id);
    if (n.type === 'OUTPUT') return args[0];
    if (n.type === 'AND3') return { type: 'AND', args: [{ type: 'AND', args: args.slice(0, 2) }, args[2]] };
    return { type: n.type as Exclude<GateType, 'AND3'>, args };
  };
  return model.nodes
    .filter((n) => n.type === 'OUTPUT')
    .sort((a, b) => a.y - b.y || a.x - b.x || a.id - b.id)
    .flatMap((o) => {
      const ast = build(o);
      return ast ? [{ name: o.name!, ast }] : [];
    });
}
