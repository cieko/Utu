import { Pool } from 'pg';
import { DEFAULT_STARTING_GOAL } from './goal';

export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  count: number;
}

export type GoalSource = 'auto' | 'manual';

export interface CountingChannelState {
  channelId: string;
  lastNumber: number;
  topicPage: number;
  leaderboard: Record<string, LeaderboardEntry>;
  goal?: number;
  goalSource: GoalSource;
  manualBaseline?: number;
}

interface CountingStoreState {
  channels: Record<string, CountingChannelState>;
}

const defaultStoreState: CountingStoreState = {
  channels: {},
};

const ensureSchemaSQL = `
  CREATE TABLE IF NOT EXISTS counting_channels (
    channel_id TEXT PRIMARY KEY,
    last_number BIGINT NOT NULL DEFAULT 0,
    topic_page INTEGER NOT NULL DEFAULT 0,
    goal BIGINT,
    goal_source TEXT NOT NULL DEFAULT 'auto',
    manual_baseline BIGINT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS counting_leaderboard (
    channel_id TEXT NOT NULL REFERENCES counting_channels(channel_id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    count INTEGER NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (channel_id, user_id)
  );
`;

export class CountingStore {
  private state: CountingStoreState = cloneStoreState(defaultStoreState);

  constructor(private readonly db: Pool) {}

  async load(expectedChannelIds: string[] = []): Promise<CountingStoreState> {
    await this.ensureSchema();

    const client = await this.db.connect();
    try {
      const channelRows = await client.query<ChannelRow>(
        'SELECT channel_id, last_number, topic_page, goal, goal_source, manual_baseline FROM counting_channels'
      );

      const leaderboardRows = await client.query<LeaderboardRow>(
        'SELECT channel_id, user_id, display_name, count FROM counting_leaderboard'
      );

      const leaderboardMap = new Map<string, Record<string, LeaderboardEntry>>();
      for (const row of leaderboardRows.rows) {
        const entries = leaderboardMap.get(row.channel_id) ?? {};
        entries[row.user_id] = {
          userId: row.user_id,
          displayName: row.display_name,
          count: row.count,
        };
        leaderboardMap.set(row.channel_id, entries);
      }

      const nextState: CountingStoreState = { channels: {} };
      for (const row of channelRows.rows) {
        const leaderboard = leaderboardMap.get(row.channel_id) ?? {};
        nextState.channels[row.channel_id] = normalizeChannelState(row.channel_id, {
          lastNumber: Number(row.last_number ?? 0),
          topicPage: row.topic_page ?? 0,
          leaderboard,
          goal: row.goal === null || row.goal === undefined ? undefined : Number(row.goal),
          goalSource: row.goal_source === 'manual' ? 'manual' : 'auto',
          manualBaseline:
            row.manual_baseline === null || row.manual_baseline === undefined
              ? undefined
              : Number(row.manual_baseline),
        });
      }

      for (const channelId of expectedChannelIds) {
        if (!nextState.channels[channelId]) {
          const defaultState = createDefaultChannelState(channelId);
          nextState.channels[channelId] = defaultState;
          await this.persistChannel(defaultState);
        }
      }

      this.state = nextState;
      return cloneStoreState(this.state);
    } finally {
      client.release();
    }
  }

  snapshot(channelId: string): CountingChannelState {
    const existing = this.state.channels[channelId];
    if (!existing) {
      return createDefaultChannelState(channelId);
    }
    return cloneChannelState(existing);
  }

  async ensureChannel(channelId: string): Promise<CountingChannelState> {
    if (!this.state.channels[channelId]) {
      const defaultState = createDefaultChannelState(channelId);
      this.state.channels[channelId] = defaultState;
      await this.persistChannel(defaultState);
    }
    return this.snapshot(channelId);
  }

  async resetChannel(channelId: string, initialGoal = DEFAULT_STARTING_GOAL): Promise<CountingChannelState> {
    await this.db.query('DELETE FROM counting_leaderboard WHERE channel_id = $1', [channelId]);
    await this.db.query('DELETE FROM counting_channels WHERE channel_id = $1', [channelId]);

    const defaultState = { ...createDefaultChannelState(channelId), goal: initialGoal, goalSource: 'auto' as const };
    this.state.channels[channelId] = defaultState;
    await this.persistChannel(defaultState);
    return cloneChannelState(defaultState);
  }

  async refreshChannel(channelId: string): Promise<CountingChannelState> {
    const current = this.state.channels[channelId] ?? createDefaultChannelState(channelId);
    const result = await this.db.query<ChannelRow>(
      'SELECT channel_id, last_number, topic_page, goal, goal_source, manual_baseline FROM counting_channels WHERE channel_id = $1',
      [channelId]
    );

    if (result.rowCount === 0) {
      this.state.channels[channelId] = current;
      await this.persistChannel(current);
      return cloneChannelState(current);
    }

    const row = result.rows[0];
    const updated = normalizeChannelState(channelId, {
      lastNumber:
        row.last_number === null || row.last_number === undefined
          ? current.lastNumber
          : Number(row.last_number),
      topicPage:
        row.topic_page === null || row.topic_page === undefined
          ? current.topicPage
          : Number(row.topic_page),
      leaderboard: current.leaderboard,
      goal: row.goal === null || row.goal === undefined ? undefined : Number(row.goal),
      goalSource: row.goal_source === 'manual' ? 'manual' : 'auto',
      manualBaseline:
        row.manual_baseline === null || row.manual_baseline === undefined
          ? undefined
          : Number(row.manual_baseline),
    });

    this.state.channels[channelId] = {
      ...updated,
      leaderboard: current.leaderboard,
    };

    return cloneChannelState(this.state.channels[channelId]);
  }

  async recordCount(
    channelId: string,
    userId: string,
    displayName: string,
    nextNumber: number
  ): Promise<CountingChannelState> {
    let updatedEntry: LeaderboardEntry | null = null;

    const nextState = await this.updateChannel(channelId, (channel) => {
      channel.lastNumber = nextNumber;

      const entry = channel.leaderboard[userId] ?? {
        userId,
        displayName,
        count: 0,
      };

      entry.count += 1;
      entry.displayName = displayName;
      channel.leaderboard[userId] = entry;
      updatedEntry = { ...entry };
    });

    if (updatedEntry) {
      await this.persistLeaderboardEntry(channelId, updatedEntry);
    }

    return nextState;
  }

  async setTopicPage(channelId: string, nextPage: number): Promise<CountingChannelState> {
    return this.updateChannel(channelId, (channel) => {
      channel.topicPage = Math.max(0, nextPage);
    });
  }

  async setGoal(
    channelId: string,
    goal: number,
    source: GoalSource
  ): Promise<CountingChannelState> {
    if (!Number.isFinite(goal) || goal <= 0) {
      throw new Error('Counting goal must be a positive number.');
    }

    return this.updateChannel(channelId, (channel) => {
      const resolvedGoal = Math.floor(goal);
      channel.goal = resolvedGoal;
      channel.goalSource = source;
      if (source === 'manual') {
        channel.manualBaseline = resolvedGoal;
      }
    });
  }

  private async updateChannel(
    channelId: string,
    mutator: (channel: CountingChannelState) => void
  ): Promise<CountingChannelState> {
    const current = this.state.channels[channelId] ?? createDefaultChannelState(channelId);
    const draft = cloneChannelState(current);
    mutator(draft);

    this.state.channels[channelId] = draft;
    await this.persistChannel(draft);
    return cloneChannelState(draft);
  }

  private async ensureSchema(): Promise<void> {
    await this.db.query(ensureSchemaSQL);
  }

  private async persistChannel(channel: CountingChannelState): Promise<void> {
    await this.db.query(
      `INSERT INTO counting_channels (channel_id, last_number, topic_page, goal, goal_source, manual_baseline, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (channel_id) DO UPDATE SET
         last_number = EXCLUDED.last_number,
         topic_page = EXCLUDED.topic_page,
         goal = EXCLUDED.goal,
         goal_source = EXCLUDED.goal_source,
         manual_baseline = EXCLUDED.manual_baseline,
         updated_at = NOW()`,
      [
        channel.channelId,
        channel.lastNumber,
        channel.topicPage,
        channel.goal ?? null,
        channel.goalSource,
        channel.manualBaseline ?? null,
      ]
    );
  }

  private async persistLeaderboardEntry(channelId: string, entry: LeaderboardEntry): Promise<void> {
    await this.db.query(
      `INSERT INTO counting_leaderboard (channel_id, user_id, display_name, count, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (channel_id, user_id) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         count = EXCLUDED.count,
         updated_at = NOW()`,
      [channelId, entry.userId, entry.displayName, entry.count]
    );
  }
}

type ChannelRow = {
  channel_id: string;
  last_number: string | number | null;
  topic_page: number | null;
  goal: string | number | null;
  goal_source: string | null;
  manual_baseline: string | number | null;
};

type LeaderboardRow = {
  channel_id: string;
  user_id: string;
  display_name: string;
  count: number;
};

function createDefaultChannelState(channelId: string): CountingChannelState {
  return {
    channelId,
    lastNumber: 0,
    topicPage: 0,
    leaderboard: {},
    goal: undefined,
    goalSource: 'auto',
    manualBaseline: undefined,
  };
}

function cloneStoreState(state: CountingStoreState): CountingStoreState {
  return {
    channels: Object.fromEntries(
      Object.entries(state.channels).map(([channelId, channelState]) => [
        channelId,
        cloneChannelState(channelState),
      ])
    ),
  };
}

function cloneChannelState(state: CountingChannelState): CountingChannelState {
  return {
    channelId: state.channelId,
    lastNumber: state.lastNumber,
    topicPage: state.topicPage,
    leaderboard: Object.fromEntries(
      Object.entries(state.leaderboard).map(([userId, entry]) => [userId, { ...entry }])
    ),
    goal: state.goal,
    goalSource: state.goalSource,
    manualBaseline: state.manualBaseline,
  };
}

function normalizeChannelState(
  channelId: string,
  value: Partial<CountingChannelState>
): CountingChannelState {
  const lastNumber = typeof value.lastNumber === 'number' && Number.isFinite(value.lastNumber)
    ? Math.max(0, Math.floor(value.lastNumber))
    : 0;
  const topicPage = typeof value.topicPage === 'number' && Number.isFinite(value.topicPage)
    ? Math.max(0, Math.floor(value.topicPage))
    : 0;
  const leaderboard = normalizeLeaderboard(value.leaderboard);
  const goal = typeof value.goal === 'number' && Number.isFinite(value.goal) && value.goal > 0
    ? Math.floor(value.goal)
    : undefined;
  const goalSource = value.goalSource === 'manual' ? 'manual' : 'auto';
  const manualBaseline = typeof value.manualBaseline === 'number' && Number.isFinite(value.manualBaseline) && value.manualBaseline > 0
    ? Math.floor(value.manualBaseline)
    : undefined;

  return {
    channelId,
    lastNumber,
    topicPage,
    leaderboard,
    goal,
    goalSource,
    manualBaseline,
  };
}

function normalizeLeaderboard(
  input: CountingChannelState['leaderboard'] | undefined
): Record<string, LeaderboardEntry> {
  if (!input) {
    return {};
  }

  const result: Record<string, LeaderboardEntry> = {};
  for (const [userId, entry] of Object.entries(input)) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const count = typeof entry.count === 'number' && Number.isFinite(entry.count)
      ? Math.max(0, Math.floor(entry.count))
      : 0;
    const displayName = typeof entry.displayName === 'string' && entry.displayName.trim().length > 0
      ? entry.displayName.trim()
      : 'Anonymous';
    result[userId] = {
      userId,
      displayName,
      count,
    };
  }

  return result;
}






