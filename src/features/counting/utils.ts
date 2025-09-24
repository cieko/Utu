import { Message } from 'discord.js';

export function sanitizeDisplayName(name: string): string {
  const trimmed = name.replace(/\s+/g, ' ').trim();
  if (!trimmed) {
    return 'Counter';
  }
  return trimmed.slice(0, 80);
}

export function resolveMemberDisplayName(message: Message): string {
  return sanitizeDisplayName(message.member?.displayName ?? message.author.username);
}
