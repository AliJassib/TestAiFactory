import { bot } from './bot.js';
import { OPENROUTER_MODEL } from './config.js';
import { parseCommand } from './utils/parseCommand.js';
import { handleModelsCommand } from './commands/models/handleCommand.js';
import { handleModelsCallbackQuery } from './commands/models/handleCallback.js';
import { handleMyModelCommand } from './commands/mymodel/handleCommand.js';
import { handleClearCommand } from './commands/clear/handleCommand.js';
import { handleCreditsCommand } from './commands/credits/handleCommand.js';
import { handleChatMessage } from './commands/chat/handleMessage.js';
import { clearUserModel } from './state/userModel.js';

export function registerHandlers() {
  bot.on('callback_query', handleModelsCallbackQuery);

  bot.on('message', async (msg) => {
    const text = msg.text;
    const userId = msg.from?.id;
    if (!text || userId == null) return;

    const { cmd0, parts } = parseCommand(text);

    if (cmd0 === '/start') {
      clearUserModel(userId);
      await bot.sendMessage(
        msg.chat.id,
        `مرحبا بك. تم ضبط الموديل على الافتراضي: ${OPENROUTER_MODEL}\nالأوامر: /models، /mymodel، /credits، /clear، ثم اكتب رسالتك للمحادثة.`
      );
      return;
    }


    if (cmd0 === '/clear') {
      await handleClearCommand(msg);
      return;
    }

    if (cmd0 === '/models') {
      await handleModelsCommand(msg, parts);
      return;
    }
    if (cmd0 === '/mymodel') {
      await handleMyModelCommand(msg);
      return;
    }

    if (cmd0 === '/credits') {
      await handleCreditsCommand(msg);
      return;
    }

    await handleChatMessage(msg);
  });
}
