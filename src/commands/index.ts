import type { BotCommand } from './types';
import { pingCommand } from './ping';
import { owoCommand } from './owo';

export { type BotCommand } from './types';
export { pingCommand } from './ping';
export { owoCommand } from './owo';

export const commands: BotCommand[] = [pingCommand, owoCommand];
export const commandMap = new Map<string, BotCommand>(
  commands.map((command) => [command.data.name, command])
);

