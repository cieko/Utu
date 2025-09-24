import { Client, Events, GatewayIntentBits } from 'discord.js';
import { env } from './config/env';
import { commandMap } from './commands';
import { createPool } from './lib/db';
import { CountingStore } from './features/counting/store';
import { CountingFeature } from './features/counting';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, 
  ],
});

const dbPool = createPool(env.databaseUrl);
const countingStore = new CountingStore(dbPool);
const countingFeature = new CountingFeature({
  client,
  store: countingStore,
  channels: env.countingChannels,
});

countingFeature.register();

client.once(Events.ClientReady, (readyClient) => {
  console.log(`✅ Logged in as ${readyClient.user.tag}`);
  if (env.guildId) {
    console.log(`Guild-scoped commands registered for guild ${env.guildId}`);
  } else {
    console.log('Using global commands. Expect up to 1 hour propagation time.');
  }
  console.log(`Counting feature active on ${env.countingChannels.length} channel(s).`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  const command = commandMap.get(interaction.commandName);
  if (!command) {
    await interaction.reply({
      content: 'owo? I do not know that slash command yet.',
      ephemeral: true,
    });
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error('Command execution failed:', error);
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({
        content: 'Something went wrong while executing that command.',
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: 'Something went wrong while executing that command.',
        ephemeral: true,
      });
    }
  }
});

async function main() {
  console.log('🔌 Logging in...');
  await client.login(env.token);
}

void main().catch((error) => {
  console.error('Fatal error while starting the bot:', error);
  process.exit(1);
});

const shutdown = async () => {
  try {
    await dbPool.end();
  } catch (error) {
    console.error('Error while closing database pool:', error);
  }
};

process.once('beforeExit', shutdown);
process.once('SIGINT', async () => {
  await shutdown();
  process.exit(0);
});
process.once('SIGTERM', async () => {
  await shutdown();
  process.exit(0);
});
