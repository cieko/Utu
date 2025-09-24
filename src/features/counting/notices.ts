import type { Message, TextChannel } from 'discord.js';
import {
  HIDDEN_NOTIFICATION_SUFFIX,
  TEMP_NOTICE_COUNTDOWN_SECONDS,
} from './constants';
import type { Logger } from './types';

export async function sendTemporaryNotice(
  channel: TextChannel,
  messageContent: string,
  logger: Logger,
  userId?: string
): Promise<void> {
  const mention = userId ? `<@${userId}> ` : '';
  const base = `${mention}${messageContent}\n\n${HIDDEN_NOTIFICATION_SUFFIX}`;
  const initial = `${base}\n\nThis notice disappears in ${TEMP_NOTICE_COUNTDOWN_SECONDS}s.`;

  try {
    const notice = await channel.send({
      content: initial,
      allowedMentions: userId ? { users: [userId] } : undefined,
    });
    logger.log(`[counting] Posted correction notice in ${channel.id}.`);

    for (let elapsed = 1; elapsed <= TEMP_NOTICE_COUNTDOWN_SECONDS; elapsed += 1) {
      setTimeout(() => {
        const remaining = TEMP_NOTICE_COUNTDOWN_SECONDS - elapsed;
        if (remaining > 0) {
          notice
            .edit({ content: `${base}\n\nThis notice disappears in ${remaining}s.` })
            .catch(() => {
              /* ignore */
            });
        } else {
          notice.delete().catch(() => {
            /* ignore */
          });
        }
      }, elapsed * 1000);
    }
  } catch (error) {
    logger.warn('Unable to send counting notice in channel:', error);
  }
}
