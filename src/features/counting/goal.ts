import type { CountingChannelState } from './store';

export const DEFAULT_STARTING_GOAL = 1000;

export function computeNextGoal(currentGoal: number): number {
  const baseline = Math.max(1, Math.floor(currentGoal));
  const increment = Math.max(1, Math.ceil(baseline * 0.05));
  const next = baseline + increment;
  if (baseline >= DEFAULT_STARTING_GOAL) {
    return Math.max(DEFAULT_STARTING_GOAL, next);
  }
  return next;
}

export function computeInitialGoal(
  state: CountingChannelState,
  manualSuggestion?: number
): number {
  if (manualSuggestion && manualSuggestion > state.lastNumber) {
    return Math.floor(manualSuggestion);
  }

  if (state.goal && state.goal > state.lastNumber) {
    const resolved = Math.floor(state.goal);
    if (state.goalSource === 'manual') {
      return resolved;
    }
    return Math.max(DEFAULT_STARTING_GOAL, resolved);
  }

  if (state.lastNumber === 0) {
    return DEFAULT_STARTING_GOAL;
  }

  const increment = Math.max(1, Math.ceil(state.lastNumber * 0.05));
  const candidate = state.lastNumber + increment;
  return Math.max(DEFAULT_STARTING_GOAL, candidate);
}

export function shouldPromoteGoal(state: CountingChannelState): boolean {
  return typeof state.goal === 'number' && state.goal > 0 && state.lastNumber >= state.goal;
}
