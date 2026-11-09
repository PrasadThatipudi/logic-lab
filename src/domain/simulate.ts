import { GATE_FN } from './circuit.ts';
import { arity } from './canvas.ts';
import type { Bit, CanvasModel, GateType, Signals } from './types.ts';

/**
 * Live values for colouring; unconnected pins read as 0.
 * Gates are re-evaluated in order until nothing changes, starting from `prev`, so cross-coupled
 * gates (SR latch) keep their state and combinational logic settles in a few passes.
 */
export function simulate(model: CanvasModel, prev: Signals = new Map()): Signals {
  const ids = new Set(model.nodes.map((n) => n.id));
  const vals: Signals = new Map([...prev].filter(([id]) => ids.has(id)));
  const read = (id: number): Bit => vals.get(id) ?? 0;
  for (let pass = 0; pass < 100; pass++) {
    let changed = false;
    for (const n of model.nodes) {
      let v: Bit;
      if (n.type === 'INPUT') v = n.value ? 1 : 0;
      else if (n.type === 'CONST') v = n.value ?? 0;
      else {
        const ins = Array.from({ length: arity(n.type) }, (_, k) => {
          const w = model.wires.find((x) => x.to === n.id && x.pin === k);
          return w ? read(w.from) : 0;
        });
        v = n.type === 'OUTPUT' ? ins[0] : GATE_FN[n.type as GateType](...ins);
      }
      if (vals.get(n.id) !== v) { vals.set(n.id, v); changed = true; }
    }
    if (!changed) break;
  }
  return vals;
}

export function hasLoop(model: CanvasModel): boolean {
  const state = new Map<number, 1 | 2>();
  const visit = (id: number): boolean => {
    if (state.get(id) === 1) return true;
    if (state.get(id) === 2) return false;
    state.set(id, 1);
    const found = model.wires.some((w) => w.to === id && visit(w.from));
    state.set(id, 2);
    return found;
  };
  return model.nodes.some((n) => visit(n.id));
}
