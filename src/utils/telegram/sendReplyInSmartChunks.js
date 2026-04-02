import {
  MAX_TELEGRAM_CHARS,
  MESSAGE_FIRST_CHUNK_CHARS
} from '../../config.js';
import { safeEditMessageText } from './safeEditMessageText.js';

/**
 * @param {import('node-telegram-bot-api').TelegramBot} bot
 * @returns {Promise<number[]>} معرّفات رسائل البوت المُرسلة
 */
export async function sendReplyInSmartChunks(bot, chatId, text) {
  /** @type {number[]} */
  const messageIds = [];
  if (!text.length) return messageIds;
  const firstStep = Math.min(MESSAGE_FIRST_CHUNK_CHARS, MAX_TELEGRAM_CHARS);
  let offset = 0;
  while (offset < text.length) {
    const end = Math.min(offset + MAX_TELEGRAM_CHARS, text.length);
    const segment = text.slice(offset, end);
    if (segment.length <= firstStep) {
      const sent = await bot.sendMessage(chatId, segment);
      messageIds.push(sent.message_id);
    } else {
      const sent = await bot.sendMessage(chatId, segment.slice(0, firstStep));
      await safeEditMessageText(bot, chatId, sent.message_id, segment);
      messageIds.push(sent.message_id);
    }
    offset = end;
  }
  return messageIds;
}
