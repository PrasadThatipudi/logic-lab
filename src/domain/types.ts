export type Bit = 0 | 1;
export type Style = 'algebra' | 'words';

export type Op = 'AND' | 'NAND' | 'OR' | 'NOR' | 'XOR' | 'XNOR' | 'NOT';
export type GateType = Op | 'AND3';

export type Expr =
  | { type: 'VAR'; name: string }
  | { type: 'CONST'; value: Bit }
  | { type: Op; args: Expr[] };

/** Netlist consumed by the test runner; nodes are in topological order. */
export interface CircuitNode {
  id: number;
  kind: 'input' | 'const' | 'gate';
  type?: GateType;
  name?: string;
  value?: Bit;
  inputs: number[];
}
export interface Circuit {
  nodes: CircuitNode[];
  outputs: { name: string; id: number }[];
  inputs: string[];
  outId: number;
  outputName: string;
}

export type NodeType = GateType | 'INPUT' | 'OUTPUT' | 'CONST';
export interface EditorNode {
  id: number;
  type: NodeType;
  x: number;
  y: number;
  name?: string;
  value?: Bit;
}
export interface Wire { from: number; to: number; pin: number }
export interface CanvasModel { nodes: EditorNode[]; wires: Wire[]; seq: number }
export type Signals = Map<number, Bit>;
