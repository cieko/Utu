import type { TextChannel } from 'discord.js';
import { buildChannelName, buildChannelTopic } from './topic';
import type { Logger } from './types';
import type { CountingStore } from './store';

const RENAME_AND_TOPIC_COOLDOWN_MS = 600_000; // 10 minutes
const MIN_EXECUTION_DELAY_MS = 1_500;

export interface ChannelUpdateScheduler {
  requestImmediateUpdate(reason?: string): void;
  dispose(): void;
}

interface SchedulerDeps {
  channel: TextChannel;
  channelId: string;
  store: CountingStore;
  logger: Logger;
}

export function scheduleUpdates({
  channel,
  channelId,
  store,
  logger,
}: SchedulerDeps): ChannelUpdateScheduler {
  let disposed = false;
  let nextEligibleAt = 0;
  let pendingTimer: NodeJS.Timeout | null = null;
  let pendingReason = 'scheduled';
  let scheduledFor: number | null = null;
  let queue = Promise.resolve();

  const clearTimer = () => {
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
  };

  const applyPresentation = async (
    reason: string,
    executedAt: number
  ): Promise<void> => {
    const state = await store.refreshChannel(channelId);
    const desiredName = buildChannelName(state);

    if (channel.name !== desiredName) {
      try {
        await channel.setName(desiredName);
        logger.log(
          `[counting] Renamed channel ${channelId} to ${desiredName} (${reason}).`
        );
      } catch (error) {
        logger.error(`Failed to rename channel ${channelId}:`, error);
      }
    }

    const nextReloadAt = executedAt + RENAME_AND_TOPIC_COOLDOWN_MS;
    const topicInfo = buildChannelTopic(state, {
      nextReloadAt,
    });
    const currentTopic = channel.topic ?? '';
    if (currentTopic !== topicInfo.topic) {
      try {
        await channel.setTopic(topicInfo.topic);
        logger.log(
          `[counting] Updated topic for channel ${channelId} (${reason}).`
        );
      } catch (error) {
        logger.error(`Failed to update topic for ${channelId}:`, error);
      }
    }

    try {
      await store.setTopicPage(channelId, topicInfo.nextPageIndex);
    } catch (error) {
      logger.error(`Failed to persist topic page for ${channelId}:`, error);
    }
  };

  const scheduleNextUpdate = (targetTime: number, reason: string): void => {
    if (disposed) {
      return;
    }

    const now = Date.now();
    const earliest = Math.max(targetTime, nextEligibleAt, now);

    if (scheduledFor !== null && Math.abs(scheduledFor - earliest) < 50) {
      pendingReason = reason;
      return;
    }

    clearTimer();
    pendingReason = reason;
    scheduledFor = earliest;
    const delay = Math.max(0, earliest - now);

    pendingTimer = setTimeout(() => {
      if (disposed) {
        return;
      }
      pendingTimer = null;
      scheduledFor = null;
      const runReason = pendingReason;
      pendingReason = 'scheduled';

      queue = queue
        .then(async () => {
          const executedAt = Date.now();
          try {
            await applyPresentation(runReason, executedAt);
          } finally {
            nextEligibleAt = executedAt + RENAME_AND_TOPIC_COOLDOWN_MS;
            scheduleNextUpdate(nextEligibleAt, 'cooldown');
          }
        })
        .catch((error) => {
          logger.error(
            `Counting presentation refresh failed for ${channelId}:`,
            error
          );
        });
    }, delay);
  };

  const requestImmediateUpdate = (reason = 'immediate'): void => {
    const desiredTime = Date.now() + MIN_EXECUTION_DELAY_MS;
    scheduleNextUpdate(desiredTime, reason);
  };

  // Kick off initial refresh so the channel presentation updates promptly.
  scheduleNextUpdate(Date.now(), 'initial');

  return {
    requestImmediateUpdate,
    dispose: () => {
      disposed = true;
      clearTimer();
    },
  };
}
