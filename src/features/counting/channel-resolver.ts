import { ChannelType, type Client, type TextChannel } from 'discord.js';
import type { Logger } from './types';

export async function resolveTextChannel(
  client: Client,
  channelId: string,
  cache: Map<string, TextChannel>,
  logger: Logger
): Promise<TextChannel | null> {
  const cached = cache.get(channelId);
  if (cached) {
    return cached;
  }

  try {
    const fetched = await client.channels.fetch(channelId);
    if (!fetched) {
      return null;
    }
    if (fetched.type !== ChannelType.GuildText) {
      return null;
    }

    cache.set(channelId, fetched);
    return fetched;
  } catch (error) {
    logger.error(`Failed to fetch counting channel ${channelId}:`, error);
    return null;
  }
}
