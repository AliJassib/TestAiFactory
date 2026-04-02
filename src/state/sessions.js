import { MAX_HISTORY_PAIRS } from '../config.js';

/** حد أقصى لمعرّفات تيليغرام المخزّنة لكل مستخدم (للمسح لاحقاً). */
const MAX_TELEGRAM_MESSAGE_IDS = 500;

/** @type {Map<number, { messages: Array<{ role: 'user' | 'assistant'; content: string }>; telegramMessageIds?: number[] }>} */
export const sessions = new Map();

export function trimSessionMessages(messages) {
  const maxTurns = MAX_HISTORY_PAIRS * 2;
  if (messages.length <= maxTurns) return messages;
  return messages.slice(-maxTurns);
}

/**
 * @param {number} userId
 */
export function popLastTelegramMessageId(userId) {
  const session = sessions.get(userId);
  if (!session?.telegramMessageIds?.length) return;
  session.telegramMessageIds.pop();
  if (session.telegramMessageIds.length === 0) delete session.telegramMessageIds;
  if (session.messages.length === 0 && !session.telegramMessageIds?.length) {
    sessions.delete(userId);
  } else sessions.set(userId, session);
}

export function clearSession(userId) {
  sessions.delete(userId);
}

/**
 * @param {{ telegramMessageIds?: number[] }} session
 * @param {number} messageId
 */
export function pushTelegramMessageId(session, messageId) {
  if (!session.telegramMessageIds) session.telegramMessageIds = [];
  session.telegramMessageIds.push(messageId);
  if (session.telegramMessageIds.length > MAX_TELEGRAM_MESSAGE_IDS) {
    session.telegramMessageIds = session.telegramMessageIds.slice(
      -MAX_TELEGRAM_MESSAGE_IDS
    );
  }
}
