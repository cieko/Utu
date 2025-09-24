import { SlashCommandBuilder } from 'discord.js';
import type { BotCommand } from './types';

export const pingCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check if the bot is awake and measure latency.'),
  async execute(interaction) {
    const sent = await interaction.reply({ content: '🏓 Pong!', fetchReply: true });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    const heartbeat = Math.round(interaction.client.ws.ping);
    await interaction.editReply(
      `🏓 Pong! Round-trip latency: **${latency}ms** · WebSocket heartbeat: **${heartbeat}ms**`
    );
  },
};

