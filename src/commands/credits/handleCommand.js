import { bot } from '../../bot.js';
import { MAX_TELEGRAM_CHARS } from '../../config.js';
import { fetchOpenRouterCredits } from '../../services/openrouter/getCredits.js';

/**
 * أمر /credits — استجابة JSON من GET /api/v1/credits
 * @param {import('node-telegram-bot-api').Message} msg
 */
export async function handleCreditsCommand(msg) {
  const chatId = msg.chat.id;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const data = await fetchOpenRouterCredits(controller.signal);
    let text = JSON.stringify(data, null, 2);
    if (text.length > MAX_TELEGRAM_CHARS) {
      text = text.slice(0, MAX_TELEGRAM_CHARS - 20) + '\n…(مقطوع)';
    }
    await bot.sendMessage(chatId, text);
  } catch (e) {
    const errMsg =
      e.name === 'AbortError'
        ? 'انتهت مهلة الطلب.'
        : e.message || 'خطأ غير معروف';
    await bot.sendMessage(chatId, errMsg);
  } finally {
    clearTimeout(timeoutId);
  }
}
