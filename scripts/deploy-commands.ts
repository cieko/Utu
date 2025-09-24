import { REST, Routes } from 'discord.js';
import { commands } from '../src/commands';
import { env } from '../src/config/env';

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(env.token);
  const body = commands.map((command) => command.data.toJSON());

  if (env.guildId) {
    await rest.put(Routes.applicationGuildCommands(env.clientId, env.guildId), { body });
    console.log(`Registered ${body.length} guild command(s) for guild ${env.guildId}.`);
  } else {
    await rest.put(Routes.applicationCommands(env.clientId), { body });
    console.log(`Registered ${body.length} global command(s).`);
  }
}

registerCommands().catch((error) => {
  console.error('Failed to deploy commands:', error);
  process.exit(1);
});

