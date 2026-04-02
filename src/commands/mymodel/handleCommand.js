import { bot } from '../../bot.js';
import { getModelForUser } from '../../state/userModel.js';

/**
 * أمر /mymodel
 * @param {import('node-telegram-bot-api').Message} msg
 */
export async function handleMyModelCommand(msg) {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (userId == null) return;

  await bot.sendMessage(
    chatId,
    `الموديل الحالي:\n${getModelForUser(userId)}`
  );
}
