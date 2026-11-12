import { useCallback, useRef, useState } from 'react';
import { loadModel } from '../domain/canvas.ts';
import { simulate } from '../domain/simulate.ts';
import type { CanvasModel, Signals } from '../domain/types.ts';
import { storage } from './useLocalStorage.ts';

interface State { model: CanvasModel; signals: Signals }

const HISTORY_LIMIT = 100;

/**
 * Holds the canvas model plus its simulated signals.
 * Signals are recomputed from the previous ones so latches keep their state across edits.
 */
export function useCircuit() {
  const [state, setState] = useState<State>(() => {
    const model = loadModel(storage.get('canvas'));
    return { model, signals: simulate(model) };
  });
  const ref = useRef(state);

  const commit = useCallback((model: CanvasModel, fresh = false) => {
    const next = { model, signals: simulate(model, fresh ? new Map() : ref.current.signals) };
    ref.current = next;
    storage.set('canvas', JSON.stringify(model));
    setState(next);
  }, []);

  // models are never mutated once committed, so snapshots can be kept as they are
  const past = useRef<CanvasModel[]>([]);
  const future = useRef<CanvasModel[]>([]);

  const remember = () => {
    past.current.push(ref.current.model);
    if (past.current.length > HISTORY_LIMIT) past.current.shift();
    future.current = [];
  };

  /**
   * Mutates a copy of the model; if `fn` throws the model is left untouched and the error is rethrown.
   * Pass `record = false` for the follow-up steps of one gesture (e.g. a drag) so it undoes as a single step.
   */
  const edit = useCallback((fn: (draft: CanvasModel) => void, record = true) => {
    const draft = structuredClone(ref.current.model);
    fn(draft);
    if (record) remember();
    commit(draft);
  }, [commit]);

  const replace = useCallback((model: CanvasModel) => {
    if (ref.current.model.nodes.length) remember();
    commit(model, true);
  }, [commit]);

  const travel = useCallback((from: CanvasModel[], to: CanvasModel[]) => {
    const model = from.pop();
    if (!model) return false;
    to.push(ref.current.model);
    commit(model);
    return true;
  }, [commit]);

  const undo = useCallback(() => travel(past.current, future.current), [travel]);
  const redo = useCallback(() => travel(future.current, past.current), [travel]);

  const current = useCallback(() => ref.current.model, []);

  return { model: state.model, signals: state.signals, edit, replace, undo, redo, current, canUndo: past.current.length > 0, canRedo: future.current.length > 0 };
}
