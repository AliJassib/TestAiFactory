/**
 * @param {import('node-telegram-bot-api').TelegramBot} bot
 */
export async function safeEditMessageText(bot, chatId, messageId, text) {
  try {
    await bot.editMessageText(text, { chat_id: chatId, message_id: messageId });
  } catch (e) {
    const desc = e.response?.body?.description || e.message || '';
    if (String(desc).includes('message is not modified')) return;
    throw e;
  }
}
