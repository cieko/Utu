import { config as loadEnv } from 'dotenv';

loadEnv();

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface CountingChannelConfig {
  channelId: string;
  webhookUrl: string;
  initialGoal?: number;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function parseLogLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  if (raw === 'error' || raw === 'warn' || raw === 'info' || raw === 'debug') {
    return raw;
  }
  console.warn(`Unknown LOG_LEVEL "${raw}", falling back to "info".`);
  return 'info';
}

function parseOptionalPositiveInteger(raw?: string | null): number | undefined {
  if (!raw || raw.trim().length === 0) {
    return undefined;
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Expected a positive integer but received "${raw}".`);
  }

  return Math.floor(value);
}

function parseCountingChannels(): CountingChannelConfig[] {
  const raw = process.env.COUNTING_CHANNELS;
  if (raw && raw.trim().length > 0) {
    const entries = raw
      .split(';')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .map(parseCountingChannelEntry);

    if (entries.length === 0) {
      throw new Error('COUNTING_CHANNELS is defined but no valid entries were found.');
    }

    const seen = new Set<string>();
    for (const entry of entries) {
      if (seen.has(entry.channelId)) {
        throw new Error(`Duplicate channel ID detected in COUNTING_CHANNELS: ${entry.channelId}`);
      }
      seen.add(entry.channelId);
    }

    return entries;
  }

  const channelId = process.env.COUNTING_CHANNEL_ID?.trim();
  const webhookUrl = process.env.COUNTING_WEBHOOK_URL?.trim();

  if (!channelId || !webhookUrl) {
    throw new Error(
      'Configure COUNTING_CHANNELS or provide COUNTING_CHANNEL_ID and COUNTING_WEBHOOK_URL for the counting feature.'
    );
  }

  return [
    {
      channelId,
      webhookUrl,
    },
  ];
}

function parseCountingChannelEntry(fragment: string, index: number): CountingChannelConfig {
  const parts = fragment.split('|');
  if (parts.length < 2) {
    throw new Error(
      `COUNTING_CHANNELS entry #${index + 1} must follow the format channelId|webhookUrl|optionalGoal.`
    );
  }

  const [channelIdRaw, webhookUrlRaw, goalRaw] = parts;
  const channelId = channelIdRaw?.trim();
  const webhookUrl = webhookUrlRaw?.trim();

  if (!channelId) {
    throw new Error(`COUNTING_CHANNELS entry #${index + 1} is missing a channel ID.`);
  }
  if (!webhookUrl) {
    throw new Error(`COUNTING_CHANNELS entry #${index + 1} is missing a webhook URL.`);
  }

  const initialGoal = parseOptionalPositiveInteger(goalRaw?.trim());

  return {
    channelId,
    webhookUrl,
    initialGoal,
  };
}

export const env = {
  get token(): string {
    return requireEnv('DISCORD_TOKEN');
  },
  get clientId(): string {
    return requireEnv('DISCORD_CLIENT_ID');
  },
  get guildId(): string | undefined {
    const value = process.env.DISCORD_GUILD_ID;
    return value && value.length > 0 ? value : undefined;
  },
  get logLevel(): LogLevel {
    return parseLogLevel();
  },
  get databaseUrl(): string {
    return requireEnv('DATABASE_URL');
  },
  get countingChannels(): CountingChannelConfig[] {
    return parseCountingChannels();
  },
  get enableHealthServer(): boolean {
    const raw = process.env.ENABLE_HEALTH_SERVER;
    if (!raw) {
      return false;
    }
    return raw.trim().toLowerCase() === 'true';
  },
  get healthServerPort(): number | undefined {
    const explicit = parseOptionalPositiveInteger(process.env.HEALTH_SERVER_PORT);
    if (explicit !== undefined) {
      return explicit;
    }
    return parseOptionalPositiveInteger(process.env.PORT);
  },
  get healthServerHost(): string {
    const value = process.env.HEALTH_SERVER_HOST?.trim();
    return value && value.length > 0 ? value : '0.0.0.0';
  },
};
