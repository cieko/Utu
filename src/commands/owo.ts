import { SlashCommandBuilder } from 'discord.js';
import type { BotCommand } from './types';
import { owoify } from '../utils/owoify';

export const owoCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('owo')
    .setDescription('Convert your message into owo-speak.')
    .addStringOption((option) =>
      option
        .setName('text')
        .setDescription('What would you like me to owoify?')
        .setRequired(true)
        .setMaxLength(1800)
    ),
  async execute(interaction) {
    const text = interaction.options.getString('text', true);
    const owod = owoify(text);

    if (owod.length > 2000) {
      await interaction.reply({
        content: 'owo that is *way* too long... please try something shorter!',
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({ content: owod });
  },
};

