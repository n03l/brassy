import { LIMITS } from '../model/limits';

export type LadderConfig = { step: number; every: number; goal: number };
export const DEFAULT_LADDER: LadderConfig = { step: 5, every: 2, goal: 100 };

export type LadderState = { start: number; speed: number; cleanStreak: number; loops: number };

export function startLadder(speed: number): LadderState {
  return { start: speed, speed, cleanStreak: 0, loops: 0 };
}

/** One loop finished. Every `every` clean loops in a row, speed goes up by `step`, never past the goal. */
export function loopDone(s: LadderState, cfg: LadderConfig): LadderState {
  const loops = Math.min(LIMITS.loopsMax, s.loops + 1);
  const streak = s.cleanStreak + 1;
  if (streak >= cfg.every && s.speed < cfg.goal) {
    return { ...s, loops, cleanStreak: 0, speed: Math.min(cfg.goal, LIMITS.speedMax, s.speed + cfg.step) };
  }
  return { ...s, loops, cleanStreak: streak };
}

/** "That one was bumpy": the streak starts again. */
export function bumpy(s: LadderState): LadderState {
  return { ...s, cleanStreak: 0 };
}

export function normalizeLadder(v: unknown): LadderConfig {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const pick = (x: unknown, allowed: number[], d: number) => (typeof x === 'number' && allowed.includes(x) ? x : d);
  const goal = typeof o.goal === 'number' && Number.isFinite(o.goal)
    ? Math.min(LIMITS.speedMax, Math.max(LIMITS.speedMin, Math.round(o.goal / 5) * 5)) : DEFAULT_LADDER.goal;
  return { step: pick(o.step, [5, 10], 5), every: pick(o.every, [1, 2, 3], 2), goal };
}
