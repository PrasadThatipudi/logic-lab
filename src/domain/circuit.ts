import { parse, splitStatements, ParseError } from './parser.ts';
import type { Bit, Circuit, CircuitNode, Expr, GateType, Style } from './types.ts';

export const GATE_FN: Record<GateType, (...v: Bit[]) => Bit> = {
  AND: (a, b) => (a & b) as Bit,
  AND3: (a, b, c) => (a & b & c) as Bit,
  OR: (a, b) => (a | b) as Bit,
  NAND: (a, b) => ((a & b) ^ 1) as Bit,
  NOR: (a, b) => ((a | b) ^ 1) as Bit,
  XOR: (a, b) => (a ^ b) as Bit,
  XNOR: (a, b) => ((a ^ b) ^ 1) as Bit,
  NOT: (a) => (a ^ 1) as Bit,
};

/**
 * Builds a netlist from one or more expressions (one per line or ";"). Inputs are shared between outputs.
 * nodes are in topological order; each node: { id, kind: 'input'|'const'|'gate', type, name, value, inputs: [ids] }
 * Returns { nodes, outputs: [{ name, id }], inputs, outId, outputName } (outId/outputName = first output).
 */
export function buildCircuit(src: string, style: Style = 'words'): Circuit {
  const statements = splitStatements(src);
  if (!statements.length) throw new ParseError('Expression is empty');
  const nodes: CircuitNode[] = [];
  const vars = new Map<string, number>();
  const outputs: Circuit['outputs'] = [];
  const add = (n: Omit<CircuitNode, 'id'>) => { nodes.push({ ...n, id: nodes.length }); return nodes.length - 1; };

  const walk = (e: Expr): number => {
    if (e.type === 'VAR') {
      if (!vars.has(e.name)) vars.set(e.name, add({ kind: 'input', name: e.name, inputs: [] }));
      return vars.get(e.name)!;
    }
    if (e.type === 'CONST') return add({ kind: 'const', value: e.value, name: String(e.value), inputs: [] });
    const inputs = e.args.map(walk);
    return add({ kind: 'gate', type: e.type, inputs });
  };

  statements.forEach((st, i) => {
    let parsed: ReturnType<typeof parse>;
    try { parsed = parse(st, style); } catch (e) {
      if (statements.length === 1) throw e;
      throw new ParseError(`Output ${i + 1}: ${(e as Error).message}`);
    }
    let name = parsed.output;
    if (!parsed.named && outputs.some((o) => o.name === name)) {
      let k = 2;
      while (outputs.some((o) => o.name === `${name}${k}`)) k++;
      name = `${name}${k}`;
    }
    if (outputs.some((o) => o.name === name)) throw new ParseError(`Output "${name}" is defined more than once`);
    outputs.push({ name, id: walk(parsed.ast) });
  });
  const inputs = nodes.filter((n) => n.kind === 'input').map((n) => n.name!);
  return { nodes, outputs, inputs, outId: outputs[0].id, outputName: outputs[0].name };
}

/** values: { name: 0|1 }. Returns array of node values indexed by node id. */
export function evaluate(circuit: Circuit, values: Record<string, number>): Bit[] {
  const out: Bit[] = new Array(circuit.nodes.length);
  for (const n of circuit.nodes) {
    if (n.kind === 'input') out[n.id] = values[n.name!] ? 1 : 0;
    else if (n.kind === 'const') out[n.id] = n.value!;
    else out[n.id] = GATE_FN[n.type!](...n.inputs.map((i) => out[i]));
  }
  return out;
}

export function evaluateOutput(circuit: Circuit, values: Record<string, number>): Bit {
  return evaluate(circuit, values)[circuit.outId];
}

/** values: { name: 0|1 }. Returns { outputName: 0|1 } for every output. */
export function evaluateOutputs(circuit: Circuit, values: Record<string, number>): Record<string, Bit> {
  const v = evaluate(circuit, values);
  return Object.fromEntries(circuit.outputs.map((o) => [o.name, v[o.id]]));
}
