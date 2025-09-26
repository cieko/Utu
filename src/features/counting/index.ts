import { Client, Events, Message, TextChannel } from "discord.js";
import type { CountingChannelConfig } from "../../config/env";
import { DEFAULT_STARTING_GOAL } from "./goal";
import { seedChannelStateFromHistory } from "./history";
import { ensureActiveGoal } from "./goal-manager";
import { scheduleUpdates, type ChannelUpdateScheduler } from "./scheduler";
import { sendTemporaryNotice } from "./notices";
import { resolveTextChannel } from "./channel-resolver";
import type { Logger } from "./types";
import type { CountingStore } from "./store";
import { resolveMemberDisplayName } from "./utils";

export type CountingFeatureOptions = {
  client: Client;
  store: CountingStore;
  channels: CountingChannelConfig[];
  logger?: Logger;
};

export class CountingFeature {
  private readonly client: Client;
  private readonly store: CountingStore;
  private readonly logger: Logger;
  private readonly channelConfigs = new Map<string, CountingChannelConfig>();
  private readonly queues = new Map<string, Promise<void>>();
  private readonly channelCache = new Map<string, TextChannel>();
  private readonly schedulers = new Map<string, ChannelUpdateScheduler>();
  private initialized = false;

  constructor(options: CountingFeatureOptions) {
    this.client = options.client;
    this.store = options.store;
    this.logger = options.logger ?? console;

    options.channels.forEach((config) => {
      this.channelConfigs.set(config.channelId, config);
    });
  }

  register(): void {
    this.client.once(Events.ClientReady, async (readyClient) => {
      try {
        await this.onReady(readyClient);
      } catch (error) {
        this.logger.error("Counting feature failed to initialize:", error);
      }
    });

    this.client.on(Events.MessageCreate, (message) => {
      if (!this.channelConfigs.has(message.channelId)) {
        return;
      }

      this.enqueue(message.channelId, () =>
        this.handleCountingMessage(message)
      );
    });
  }

  private enqueue(channelId: string, task: () => Promise<void>): void {
    const previous = this.queues.get(channelId) ?? Promise.resolve();
    const next = previous
      .catch((error) => {
        this.logger.error("Counting queue error:", error);
      })
      .then(task)
      .catch((error) => {
        this.logger.error("Counting queue task failed:", error);
      });

    this.queues.set(channelId, next);
  }

  private async onReady(client: Client<true>): Promise<void> {
    const channelIds = Array.from(this.channelConfigs.keys());
    await this.store.load(channelIds);
    this.initialized = true;

    for (const channelId of channelIds) {
      const config = this.channelConfigs.get(channelId);
      if (!config) continue;

      const channel = await resolveTextChannel(
        client,
        channelId,
        this.channelCache,
        this.logger
      );
      if (!channel) continue;

      const initialGoal = config.initialGoal ?? DEFAULT_STARTING_GOAL;
      const baseline = await this.store.resetChannel(channelId, initialGoal);

      let state = await seedChannelStateFromHistory(
        this.store,
        channel,
        baseline,
        this.logger
      );

      state = await ensureActiveGoal(
        this.store,
        channelId,
        config,
        state
      );

      const scheduler = scheduleUpdates({
        channel,
        channelId,
        store: this.store,
        logger: this.logger,
      });
      this.schedulers.set(channelId, scheduler);

      this.logger.log(
        `[counting] Channel ${channel.id} initialized at ${state.lastNumber}/${state.goal}`
      );
    }

    this.logger.log(
      `Counting feature ready for ${channelIds.length} channel(s).`
    );
  }

  private async handleCountingMessage(message: Message): Promise<void> {
    if (!this.initialized) return;

    if (message.partial) {
      try {
        await message.fetch();
      } catch (error) {
        this.logger.warn('Unable to resolve partial message for counting:', error);
        return;
      }
    }

    if (message.webhookId || message.author.bot || !message.guild) {
      return;
    }

    const config = this.channelConfigs.get(message.channelId);
    if (!config) {
      return;
    }

    const channel = await resolveTextChannel(
      message.client,
      message.channelId,
      this.channelCache,
      this.logger
    );
    if (!channel) {
      return;
    }

    let state = await this.store.refreshChannel(message.channelId);
    const expected = state.lastNumber + 1;
    this.logger.log(
      `[counting] Message ${message.id} from ${message.author.tag}: "${message.content}" (expected ${expected}).`
    );

    const content = message.content.trim();
    const match = /^owo\s*(\d+)$/i.exec(content);

    if (!match) {
      await this.rejectCountingMessage(
        channel,
        message,
        expected,
        'Format must be `owo <number>`.'
      );
      return;
    }

    const value = Number(match[1]);
    if (!Number.isFinite(value) || value !== expected) {
      await this.rejectCountingMessage(
        channel,
        message,
        expected,
        `Expected ${expected}, got ${value}`
      );
      return;
    }

    const displayName = resolveMemberDisplayName(message);

    state = await this.store.recordCount(
      message.channelId,
      message.author.id,
      displayName,
      value
    );
    await ensureActiveGoal(
      this.store,
      message.channelId,
      config,
      state
    );

    const scheduler = this.schedulers.get(message.channelId);
    scheduler?.requestImmediateUpdate('count-accepted');

    this.logger.log(
      `[counting] Accepted ${value} from ${message.author.tag}.`
    );
  }

  private async rejectCountingMessage(
    channel: TextChannel,
    message: Message,
    expected: number,
    reason: string
  ): Promise<void> {
    this.logger.log(
      `[counting] Rejected message ${message.id} from ${message.author.tag}: ${reason}`
    );

    try {
      await message.delete();
    } catch (error) {
      this.logger.error("Failed to delete invalid counting message:", error);
    }

    // Calculate UNIX timestamp for now + 7s
    const expireAt = Math.floor((Date.now() + 7000) / 1000);

    const detail =
      `> ⚠️ <@${message.author.id}>\n` +
      `-# Your counting entry was removed.\n` +
      `-# Next valid submission → **owo ${expected}**\n` +
      `-# ***Reason:*** ${reason}\n\n` +
      `-# *(This notice disappears <t:${expireAt}:R>)*`;

    try {
      const notice = await channel.send(detail);

      // delete after 7s
      setTimeout(async () => {
        try {
          await notice.delete();
        } catch { }
      }, 7000);
    } catch (error) {
      this.logger.error("Failed to send temporary notice:", error);
    }

    const scheduler = this.schedulers.get(channel.id);
    scheduler?.requestImmediateUpdate("message-rejected");
  }
}
