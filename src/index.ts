import type { Server } from 'node:http';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { env } from './config/env';
import { commandMap } from './commands';
import { connectToDatabase, type DatabaseConnection } from './lib/db';
import { startHealthServer } from './lib/health-server';
import { CountingStore } from './features/counting/store';
import { CountingFeature } from './features/counting';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, 
  ],
});

let dbConnection: DatabaseConnection | null = null;
let healthServer: Server | null = null;

function closeServer(server: Server | null): Promise<void> {
  if (!server) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function bootstrapCountingFeature(): Promise<void> {
  dbConnection = await connectToDatabase(env.databaseUrl);

  const countingStore = new CountingStore(dbConnection.db);
  const countingFeature = new CountingFeature({
    client,
    store: countingStore,
    channels: env.countingChannels,
  });

  countingFeature.register();
}

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
  if (env.enableHealthServer) {
    try {
      healthServer = startHealthServer({
        port: env.healthServerPort,
        host: env.healthServerHost,
      });
    } catch (error) {
      console.error('Failed to start health check server:', error);
    }
  }

  await bootstrapCountingFeature();

  console.log('🔌 Logging in...');
  await client.login(env.token);
}

void main().catch((error) => {
  console.error('Fatal error while starting the bot:', error);
  process.exit(1);
});

const shutdown = async () => {
  try {
    await dbConnection?.client.close();
  } catch (error) {
    console.error('Error while closing database connection:', error);
  }

  try {
    await closeServer(healthServer);
  } catch (error) {
    console.error('Error while closing health check server:', error);
  } finally {
    healthServer = null;
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
