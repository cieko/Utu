import type { Collection, Message, TextChannel } from 'discord.js';
import { HISTORY_FETCH_LIMIT } from './constants';
import type { CountingChannelState, CountingStore } from './store';
import { resolveMemberDisplayName } from './utils';
import type { Logger } from './types';

export async function seedChannelStateFromHistory(
  store: CountingStore,
  channel: TextChannel,
  state: CountingChannelState,
  logger: Logger,
  fetchLimit: number = HISTORY_FETCH_LIMIT
): Promise<CountingChannelState> {
  try {
    const messages = await collectCountingMessages(channel, fetchLimit);
    const sorted = messages.sort(
      (a, b) => a.createdTimestamp - b.createdTimestamp
    );

    let currentNumber = state.lastNumber;
    let nextState = state;
    let replayed = 0;

    for (const historyMessage of sorted) {
      if (historyMessage.author.bot) continue;

      const match = /^owo\s*(\d+)$/i.exec(historyMessage.content.trim());
      if (!match) continue;

      const value = Number(match[1]);
      if (!Number.isFinite(value)) continue;
      if (value <= currentNumber) continue;
      if (value !== currentNumber + 1) break;

      const displayName = resolveMemberDisplayName(historyMessage);
      nextState = await store.recordCount(
        channel.id,
        historyMessage.author.id,
        displayName,
        value
      );

      currentNumber = value;
      replayed += 1;
    }

    if (replayed > 0) {
      logger.log(
        `[counting] Seeded ${replayed} historical count(s) for channel ${channel.id}.`
      );
    } else {
      logger.log(`[counting] No historical counts to seed for channel ${channel.id}.`);
    }

    return nextState;
  } catch (error) {
    logger.error('Failed to seed counting history:', error);
    return state;
  }
}

export async function collectCountingMessages(
  channel: TextChannel,
  limit: number = HISTORY_FETCH_LIMIT
): Promise<Message<true>[]> {
  const collected: Message<true>[] = [];
  let before: string | undefined;

  while (collected.length < limit) {
    const remaining = limit - collected.length;
    const batchSize = Math.min(100, remaining);
    const batch = (await channel.messages.fetch({
      limit: batchSize,
      before,
    })) as Collection<string, Message<true>>;

    if (batch.size === 0) break;

    collected.push(...batch.values());
    const oldest = batch.last();
    before = oldest?.id;

    if (!before) break;
  }

  return collected.sort((a, b) => a.createdTimestamp - b.createdTimestamp).slice(-limit);
}
