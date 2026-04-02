import { bot } from '../../bot.js';
import { buildModelsPage } from '../../services/openrouter/models/buildModelsPage.js';

/**
 * أمر /models [رقم الصفحة]
 * @param {import('node-telegram-bot-api').Message} msg
 * @param {string[]} parts
 */
export async function handleModelsCommand(msg, parts) {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (userId == null) return;

  try {
    await bot.sendChatAction(chatId, 'typing');
    let page = 0;
    if (parts[1]) {
      const pi = parseInt(parts[1], 10);
      if (!Number.isNaN(pi) && pi >= 1) page = pi - 1;
    }
    const built = await buildModelsPage(userId, page);
    if (!built) return;
    await bot.sendMessage(chatId, built.text, {
      ...(built.keyboard.length
        ? { reply_markup: { inline_keyboard: built.keyboard } }
        : {})
    });
  } catch (e) {
    console.error(e);
    await bot.sendMessage(
      chatId,
      `ما قدرت أجيب قائمة الموديلات.\n${e.message || e}`
    );
  }
}
