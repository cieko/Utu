import type { CountingChannelState, LeaderboardEntry } from "./store";
import { computeInitialGoal } from "./goal";

export interface ChannelTopic {
  topic: string;
  nextPageIndex: number;
}

export interface TopicFormatOptions {
  nextReloadAt: number; // absolute timestamp in ms (required)
}

export function buildChannelName(state: CountingChannelState): string {
  const baseGoal = state.goal ?? computeInitialGoal(state);
  const effectiveGoal = Math.max(baseGoal, state.lastNumber || 0);
  const last = Math.max(state.lastNumber, 0);
  return `˳໑◼️꒱﹕「${last}┃${effectiveGoal}」﹕loner-counts⁵`.slice(
    0,
    100
  );
}

export function buildChannelTopic(
  state: CountingChannelState,
  options: TopicFormatOptions
): ChannelTopic {
  const goal = resolveGoal(state);
  const progress =
    goal > 0 ? Math.min(100, (state.lastNumber / goal) * 100) : 0;
  const remaining = Math.max(goal - state.lastNumber, 0);

  const lines: string[] = [];
  lines.push(`Current count: ${state.lastNumber}`);
  lines.push(`Next target: ${state.lastNumber + 1}`);
  lines.push(
    `Goal: ${goal} (${progress.toFixed(1)}% complete, ${remaining} to go)`
  );

  const leaderboardEntries = sortLeaderboard(state.leaderboard).slice(0, 10);
  lines.push(`**Top 10 Counters**`);
  lines.push("");

  if (leaderboardEntries.length === 0) {
    lines.push("No counters yet. Be the first!");
  } else {
    leaderboardEntries.forEach((entry, index) => {
      const position = index + 1;
      const prefix = formatLeaderboardPlace(position);
      const mention = formatUserMention(entry.userId);
      const displayName = italicize(entry.displayName);
      const nameSegment = mention ? `${mention}` : displayName;
      lines.push(`${prefix} ${nameSegment} - ${entry.count}`);
    });
  }

  lines.push("");

  // Always show next scheduled update in relative format
  const unix = Math.floor(options.nextReloadAt / 1000); // ms → seconds
  lines.push(`Refresh <t:${unix}:R>`);

  const topic = lines.join("\n").slice(0, 1024);
  return { topic, nextPageIndex: 0 };
}

function resolveGoal(state: CountingChannelState): number {
  if (state.goal && state.goal > 0) {
    return Math.floor(state.goal);
  }
  return computeInitialGoal(state);
}

function formatLeaderboardPlace(position: number): string {
  if (position === 1) {
    return "🥇";
  }
  if (position === 2) {
    return "🥈";
  }
  if (position === 3) {
    return "🥉";
  }
  return "🏅";
}

function formatUserMention(userId: string): string {
  const sanitized = (userId ?? '').replace(/[^0-9]/g, '');
  return sanitized ? `<@${sanitized}>` : '';
}

function italicize(value: string): string {
  const escaped = escapeMarkdown(value.trim() || "Anonymous");
  return `*${escaped}*`;
}

function escapeMarkdown(value: string): string {
  return value.replace(/[\\*_`~|]/g, (match) => `\\${match}`);
}

function sortLeaderboard(
  leaderboard: CountingChannelState["leaderboard"]
): LeaderboardEntry[] {
  return Object.values(leaderboard)
    .map((entry) => ({ ...entry }))
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.displayName.localeCompare(b.displayName);
    });
}
