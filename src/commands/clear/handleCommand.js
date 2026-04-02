import { bot } from '../../bot.js';
import { sessions, clearSession } from '../../state/sessions.js';

/**
 * يمسح سجل المحادثة في الذاكرة ويحاول حذف رسائل المحادثة في تيليغرام
 * (المعرّفات المسجّلة منذ آخر تشغيل؛ قيود تيليغرام قد تمنع بعض الحذف).
 * @param {import('node-telegram-bot-api').Message} msg
 */
export async function handleClearCommand(msg) {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (userId == null) return;

  const session = sessions.get(userId);
  const ids = session?.telegramMessageIds
    ? [...session.telegramMessageIds]
    : [];

  for (const mid of ids) {
    await bot.deleteMessage(chatId, mid).catch(() => {});
  }
  clearSession(userId);

  await bot.deleteMessage(chatId, msg.message_id).catch(() => {});

  await bot.sendMessage(
    chatId,
    'تم مسح سجل المحادثة. تمت محاولة حذف الرسائل المسجّلة (قد لا يُحذف ما يزيد عن 48 ساعة أو ما لم يُسجَّل معرّفه).'
  );
}
