import { useCallback, useRef, useState } from 'react';
import { loadModel } from '../domain/canvas.ts';
import { simulate } from '../domain/simulate.ts';
import type { CanvasModel, Signals } from '../domain/types.ts';
import { storage } from './useLocalStorage.ts';

interface State { model: CanvasModel; signals: Signals }

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

  /** Mutates a copy of the model; if `fn` throws the model is left untouched and the error is rethrown. */
  const edit = useCallback((fn: (draft: CanvasModel) => void) => {
    const draft = structuredClone(ref.current.model);
    fn(draft);
    commit(draft);
  }, [commit]);

  const replace = useCallback((model: CanvasModel) => commit(model, true), [commit]);

  const current = useCallback(() => ref.current.model, []);

  return { model: state.model, signals: state.signals, edit, replace, current };
}
