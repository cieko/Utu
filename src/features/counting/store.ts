import type { Collection, Db } from 'mongodb';
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

export class CountingStore {
  private state: CountingStoreState = cloneStoreState(defaultStoreState);

  private readonly channels: Collection<ChannelDocument>;
  private readonly leaderboard: Collection<LeaderboardDocument>;
  private indexesEnsured = false;

  constructor(database: Db) {
    this.channels = database.collection<ChannelDocument>('counting_channels');
    this.leaderboard = database.collection<LeaderboardDocument>('counting_leaderboard');
  }

  async load(expectedChannelIds: string[] = []): Promise<CountingStoreState> {
    await this.ensureIndexes();

    const [channelDocs, leaderboardDocs] = await Promise.all([
      this.channels.find({}).toArray(),
      this.leaderboard.find({}).toArray(),
    ]);

    const leaderboardMap = new Map<string, Record<string, LeaderboardEntry>>();
    for (const doc of leaderboardDocs) {
      const entries = leaderboardMap.get(doc.channelId) ?? {};
      entries[doc.userId] = {
        userId: doc.userId,
        displayName: doc.displayName,
        count: doc.count,
      };
      leaderboardMap.set(doc.channelId, entries);
    }

    const nextState: CountingStoreState = { channels: {} };
    for (const doc of channelDocs) {
      const leaderboard = leaderboardMap.get(doc._id) ?? {};
      nextState.channels[doc._id] = normalizeChannelState(doc._id, {
        lastNumber: Number(doc.lastNumber ?? 0),
        topicPage: Number(doc.topicPage ?? 0),
        leaderboard,
        goal: doc.goal === null || doc.goal === undefined ? undefined : Number(doc.goal),
        goalSource: doc.goalSource === 'manual' ? 'manual' : 'auto',
        manualBaseline:
          doc.manualBaseline === null || doc.manualBaseline === undefined
            ? undefined
            : Number(doc.manualBaseline),
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
    await this.ensureIndexes();
    await this.leaderboard.deleteMany({ channelId });
    await this.channels.deleteOne({ _id: channelId });

    const defaultState = { ...createDefaultChannelState(channelId), goal: initialGoal, goalSource: 'auto' as const };
    this.state.channels[channelId] = defaultState;
    await this.persistChannel(defaultState);
    return cloneChannelState(defaultState);
  }

  async refreshChannel(channelId: string): Promise<CountingChannelState> {
    await this.ensureIndexes();
    const current = this.state.channels[channelId] ?? createDefaultChannelState(channelId);
    const doc = await this.channels.findOne({ _id: channelId });

    if (!doc) {
      this.state.channels[channelId] = current;
      await this.persistChannel(current);
      return cloneChannelState(current);
    }

    const updated = normalizeChannelState(channelId, {
      lastNumber:
        doc.lastNumber === null || doc.lastNumber === undefined
          ? current.lastNumber
          : Number(doc.lastNumber),
      topicPage:
        doc.topicPage === null || doc.topicPage === undefined
          ? current.topicPage
          : Number(doc.topicPage),
      leaderboard: current.leaderboard,
      goal: doc.goal === null || doc.goal === undefined ? undefined : Number(doc.goal),
      goalSource: doc.goalSource === 'manual' ? 'manual' : 'auto',
      manualBaseline:
        doc.manualBaseline === null || doc.manualBaseline === undefined
          ? undefined
          : Number(doc.manualBaseline),
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

  private async persistChannel(channel: CountingChannelState): Promise<void> {
    await this.ensureIndexes();
    await this.channels.updateOne(
      { _id: channel.channelId },
      {
        $set: {
          channelId: channel.channelId,
          lastNumber: channel.lastNumber,
          topicPage: channel.topicPage,
          goal: channel.goal ?? null,
          goalSource: channel.goalSource,
          manualBaseline: channel.manualBaseline ?? null,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );
  }

  private async persistLeaderboardEntry(channelId: string, entry: LeaderboardEntry): Promise<void> {
    await this.ensureIndexes();
    await this.leaderboard.updateOne(
      { _id: buildLeaderboardId(channelId, entry.userId) },
      {
        $set: {
          channelId,
          userId: entry.userId,
          displayName: entry.displayName,
          count: entry.count,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );
  }

  private async ensureIndexes(): Promise<void> {
    if (this.indexesEnsured) {
      return;
    }

    await Promise.all([
      this.channels.createIndex({ updatedAt: 1 }),
      this.leaderboard.createIndex({ channelId: 1 }),
    ]);

    this.indexesEnsured = true;
  }
}

type ChannelDocument = {
  _id: string;
  channelId: string;
  lastNumber: number;
  topicPage: number;
  goal?: number | null;
  goalSource: GoalSource;
  manualBaseline?: number | null;
  updatedAt: Date;
};

type LeaderboardDocument = {
  _id: string;
  channelId: string;
  userId: string;
  displayName: string;
  count: number;
  updatedAt: Date;
};

function buildLeaderboardId(channelId: string, userId: string): string {
  return `${channelId}:${userId}`;
}

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






