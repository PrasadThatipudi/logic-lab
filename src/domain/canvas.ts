import type { CanvasModel, EditorNode, NodeType, Wire } from './types.ts';

export const PALETTE: NodeType[] = ['INPUT', 'OUTPUT', 'NOT', 'AND', 'AND3', 'NAND', 'OR', 'NOR', 'XOR', 'XNOR'];
const ARITY: Partial<Record<NodeType, number>> = { NOT: 1, AND3: 3, INPUT: 0, CONST: 0, OUTPUT: 1 };
export const IN_X = -14, OUT_X = 78;
export const arity = (type: NodeType): number => ARITY[type] ?? 2;

/** Pin offsets relative to the node origin (left-centre of the body). */
export function inPins(node: Pick<EditorNode, 'type'>): { x: number; y: number }[] {
  const n = arity(node.type);
  const ys = n === 1 ? [0] : n === 2 ? [-10, 10] : [-16, 0, 16];
  return ys.slice(0, n).map((y) => ({ x: IN_X, y }));
}
export const outPin = (node: Pick<EditorNode, 'type'>) => (node.type === 'OUTPUT' ? null : { x: OUT_X, y: 0 });

export const emptyModel = (): CanvasModel => ({ nodes: [], wires: [], seq: 1 });

const NAME_RE = /^[A-Za-z][A-Za-z0-9_]*$/;
export const validName = (s: string) => NAME_RE.test(s);

function nextName(model: CanvasModel, type: 'INPUT' | 'OUTPUT'): string {
  const taken = new Set(model.nodes.filter((n) => n.type === type).map((n) => n.name));
  if (type === 'INPUT') {
    for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXZ') if (!taken.has(c)) return c;
    let k = 1;
    while (taken.has(`I${k}`)) k++;
    return `I${k}`;
  }
  if (!taken.has('Y')) return 'Y';
  let k = 2;
  while (taken.has(`Y${k}`)) k++;
  return `Y${k}`;
}

// The mutating helpers below expect a draft (see useCircuit), never a model that React is rendering.

export function addNode(model: CanvasModel, type: NodeType, x: number, y: number): EditorNode {
  const node: EditorNode = { id: model.seq++, type, x, y };
  if (type === 'INPUT') Object.assign(node, { name: nextName(model, type), value: 0 });
  if (type === 'OUTPUT') node.name = nextName(model, type);
  model.nodes.push(node);
  return node;
}

export function removeNode(model: CanvasModel, id: number) {
  model.nodes = model.nodes.filter((n) => n.id !== id);
  model.wires = model.wires.filter((w) => w.from !== id && w.to !== id);
}

export function renameNode(model: CanvasModel, id: number, name: string) {
  const node = model.nodes.find((n) => n.id === id);
  if (!node || !(node.type === 'INPUT' || node.type === 'OUTPUT')) return;
  if (!validName(name)) throw new Error('Names must start with a letter and use only letters, digits or _');
  if (model.nodes.some((n) => n.id !== id && (n.type === 'INPUT' || n.type === 'OUTPUT') && n.name === name)) {
    throw new Error(`"${name}" is already used`);
  }
  node.name = name;
}

/** Connects the output of `from` to input pin `pin` of `to`; replaces any wire already on that pin. */
export function connect(model: CanvasModel, from: number, to: number, pin: number) {
  const a = model.nodes.find((n) => n.id === from);
  const b = model.nodes.find((n) => n.id === to);
  if (!a || !b || !outPin(a)) throw new Error('Wires must start at an output pin');
  if (pin >= arity(b.type) || b.type === 'INPUT') throw new Error('That pin does not exist');
  model.wires = model.wires.filter((w) => !(w.to === to && w.pin === pin));
  model.wires.push({ from, to, pin });
}

export const disconnect = (model: CanvasModel, wire: Wire) => {
  model.wires = model.wires.filter((w) => !(w.from === wire.from && w.to === wire.to && w.pin === wire.pin));
};

export function loadModel(json: string | null): CanvasModel {
  try {
    const m = JSON.parse(json ?? '');
    if (Array.isArray(m.nodes) && Array.isArray(m.wires) && Number.isInteger(m.seq)) return m;
  } catch { /* ignore missing or corrupt storage */ }
  return emptyModel();
}
