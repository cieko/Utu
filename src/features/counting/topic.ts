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

  const leaderboardEntries = sortLeaderboard(state.leaderboard);
  const totalPages = Math.max(1, Math.ceil(leaderboardEntries.length / 10));
  const currentPage = Math.min(state.topicPage ?? 0, totalPages - 1);
  lines.push(`**Top Counters (page ${currentPage + 1}/${totalPages}):**`);
  lines.push("");

  if (leaderboardEntries.length === 0) {
    lines.push("No counters yet. Be the first!");
  } else {
    const start = currentPage * 10;
    const pageEntries = leaderboardEntries.slice(start, start + 10);
    pageEntries.forEach((entry, index) => {
      const position = start + index + 1;
      const displayName = italicize(entry.displayName);
      lines.push(`${position}. ${displayName} - ${entry.count}`);
    });
  }

  lines.push("");

  // Always show next scheduled update in relative format
  const unix = Math.floor(options.nextReloadAt / 1000); // ms → seconds
  lines.push(`Next update <t:${unix}:R>`);

  const topic = lines.join("\n").slice(0, 1024);
  const nextPageIndex = totalPages > 1 ? (currentPage + 1) % totalPages : 0;
  return { topic, nextPageIndex };
}

function resolveGoal(state: CountingChannelState): number {
  if (state.goal && state.goal > 0) {
    return Math.floor(state.goal);
  }
  return computeInitialGoal(state);
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
