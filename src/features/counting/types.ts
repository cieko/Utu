import type { Client, TextChannel } from 'discord.js';
import type { CountingChannelConfig } from '../../config/env';
import type { CountingStore } from './store';

export type Logger = Pick<Console, 'log' | 'warn' | 'error'>;

export interface CountingContext {
  client: Client;
  store: CountingStore;
  logger: Logger;
  channelConfigs: Map<string, CountingChannelConfig>;
  channelCache: Map<string, TextChannel>;
}
