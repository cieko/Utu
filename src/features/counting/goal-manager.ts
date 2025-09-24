import { DEFAULT_STARTING_GOAL, computeInitialGoal, computeNextGoal, shouldPromoteGoal } from './goal';
import type { CountingChannelConfig } from '../../config/env';
import type { CountingChannelState, CountingStore } from './store';

export async function ensureActiveGoal(
  store: CountingStore,
  channelId: string,
  config: CountingChannelConfig,
  state: CountingChannelState
): Promise<CountingChannelState> {
  let nextState = state;

  if (config.initialGoal && config.initialGoal > 0) {
    const desired = Math.floor(config.initialGoal);
    if (nextState.manualBaseline !== desired) {
      nextState = await store.setGoal(channelId, desired, 'manual');
    }
  } else if (!nextState.goal) {
    nextState = await store.setGoal(channelId, DEFAULT_STARTING_GOAL, 'auto');
  }

  if (!nextState.goal) {
    const initial = computeInitialGoal(nextState, config.initialGoal);
    nextState = await store.setGoal(
      channelId,
      initial,
      config.initialGoal ? 'manual' : 'auto'
    );
  }

  if (shouldPromoteGoal(nextState)) {
    nextState = await promoteGoal(store, channelId, nextState);
  }

  return nextState;
}

export async function promoteGoal(
  store: CountingStore,
  channelId: string,
  state: CountingChannelState
): Promise<CountingChannelState> {
  let target = state.goal ?? computeInitialGoal(state);
  if (target <= 0) {
    target = 1;
  }

  while (target <= state.lastNumber) {
    target = computeNextGoal(target);
  }

  return store.setGoal(channelId, target, 'auto');
}
