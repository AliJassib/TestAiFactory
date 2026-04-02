import { bot } from '../../bot.js';
import { buildModelsPage } from '../../services/openrouter/models/buildModelsPage.js';
import { getModelsEntriesCached } from '../../services/openrouter/models/cache.js';
import { setUserModel } from '../../state/userModel.js';

/**
 * أزرار قائمة الموديلات (p: صفحة، m: اختيار)
 * @param {import('node-telegram-bot-api').CallbackQuery} q
 */
export async function handleModelsCallbackQuery(q) {
  const userId = q.from?.id;
  const data = q.data;
  if (!data || userId == null) return;
  const chatId = q.message?.chat?.id;
  const messageId = q.message?.message_id;
  if (chatId == null || messageId == null) return;

  try {
    if (data.startsWith('p:')) {
      const page = parseInt(data.slice(2), 10);
      if (Number.isNaN(page)) return;
      const built = await buildModelsPage(userId, page);
      if (!built) return;
      try {
        await bot.editMessageText(built.text, {
          chat_id: chatId,
          message_id: messageId,
          ...(built.keyboard.length
            ? { reply_markup: { inline_keyboard: built.keyboard } }
            : {})
        });
      } finally {
        await bot.answerCallbackQuery(q.id).catch(() => {});
      }
      return;
    }

    if (data.startsWith('m:')) {
      const idx = parseInt(data.slice(2), 10);
      if (Number.isNaN(idx)) return;
      const entries = await getModelsEntriesCached();
      const picked = entries[idx];
      if (!picked) {
        await bot.answerCallbackQuery(q.id, {
          text: 'انتهت صلاحية القائمة. أرسل /models',
          show_alert: true
        });
        return;
      }
      setUserModel(userId, picked.id);
      await bot.answerCallbackQuery(q.id, { text: 'تم' });
      await bot.sendMessage(
        chatId,
        `✅ تم اختيار الموديل:\n${picked.name}\n\n${picked.id}`
      );
    }
  } catch (e) {
    console.error(e);
    await bot.answerCallbackQuery(q.id, {
      text: 'صار خطأ',
      show_alert: true
    }).catch(() => {});
  }
}
