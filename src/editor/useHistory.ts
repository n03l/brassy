import { useCallback, useReducer } from 'react';
import type { Song } from '../model/types';
import type { EventRef } from '../player/ScoreController';

type Snap = { song: Song; sel: EventRef | null };
type State = { past: Snap[]; present: Snap; future: Snap[] };
type Action =
  | { type: 'apply'; song: Song; sel: EventRef | null }
  | { type: 'select'; sel: EventRef | null }
  | { type: 'undo' }
  | { type: 'redo' };

export function historyReducer(s: State, a: Action): State {
  switch (a.type) {
    case 'apply':
      if (a.song === s.present.song) return a.sel === s.present.sel ? s : { ...s, present: { ...s.present, sel: a.sel } };
      return { past: [...s.past, s.present], present: { song: a.song, sel: a.sel }, future: [] };
    case 'select':
      return { ...s, present: { ...s.present, sel: a.sel } };
    case 'undo': {
      const prev = s.past.at(-1);
      return prev ? { past: s.past.slice(0, -1), present: prev, future: [s.present, ...s.future] } : s;
    }
    case 'redo': {
      const next = s.future[0];
      return next ? { past: [...s.past, s.present], present: next, future: s.future.slice(1) } : s;
    }
  }
}

/** Unlimited undo/redo for this editing session. Each snapshot remembers the selection it was made with. */
export function useHistory(initial: Song) {
  const [state, dispatch] = useReducer(historyReducer, { past: [], present: { song: initial, sel: null }, future: [] });
  return {
    song: state.present.song,
    sel: state.present.sel,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    apply: useCallback((song: Song, sel: EventRef | null) => dispatch({ type: 'apply', song, sel }), []),
    select: useCallback((sel: EventRef | null) => dispatch({ type: 'select', sel }), []),
    undo: useCallback(() => dispatch({ type: 'undo' }), []),
    redo: useCallback(() => dispatch({ type: 'redo' }), []),
  };
}
