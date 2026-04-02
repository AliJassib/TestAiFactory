import { bot } from '../../bot.js';
import { SYSTEM_PROMPT, REQUEST_TIMEOUT_MS } from '../../config.js';
import {
  sessions,
  trimSessionMessages,
  pushTelegramMessageId,
  popLastTelegramMessageId
} from '../../state/sessions.js';
import { getModelForUser } from '../../state/userModel.js';
import { completeChat } from '../../services/openrouter/chatCompletion.js';
import { sendReplyInSmartChunks } from '../../utils/telegram/sendReplyInSmartChunks.js';

/**
 * رسالة عادية → OpenRouter ثم الرد
 * @param {import('node-telegram-bot-api').Message} msg
 */
export async function handleChatMessage(msg) {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userId = msg.from?.id;
  if (!text || userId == null) return;

  let typingInterval;
  let session = null;
  let assistantSaved = false;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    session = sessions.get(userId) ?? { messages: [] };
    session.messages.push({ role: 'user', content: text });
    session.messages = trimSessionMessages(session.messages);
    pushTelegramMessageId(session, msg.message_id);
    sessions.set(userId, session);

    const apiMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...session.messages.map((m) => ({ role: m.role, content: m.content }))
    ];

    await bot.sendChatAction(chatId, 'typing');
    typingInterval = setInterval(() => {
      bot.sendChatAction(chatId, 'typing').catch(() => {});
    }, 4000);

    const model = getModelForUser(userId);

    const { fullText: rawFull, finishReason } = await completeChat({
      model,
      userId,
      messages: apiMessages,
      signal: controller.signal
    });

    let fullText = rawFull;

    if (typingInterval) {
      clearInterval(typingInterval);
      typingInterval = undefined;
    }

    if (!fullText.trim()) {
      await bot.sendMessage(chatId, 'لم يُرجع النموذج نصاً.');
      session.messages.pop();
      popLastTelegramMessageId(userId);
      if (session.messages.length === 0) sessions.delete(userId);
      else sessions.set(userId, session);
      return;
    }

    if (finishReason === 'length') {
      fullText +=
        '\n\n— توقف الرد عند حد الطول. يمكنك طلب المتابعة في رسالة جديدة.';
    }

    const botMessageIds = await sendReplyInSmartChunks(bot, chatId, fullText);
    for (const mid of botMessageIds) pushTelegramMessageId(session, mid);

    session.messages.push({ role: 'assistant', content: fullText });
    session.messages = trimSessionMessages(session.messages);
    sessions.set(userId, session);
    assistantSaved = true;
  } catch (e) {
    if (session && !assistantSaved) {
      session.messages.pop();
      popLastTelegramMessageId(userId);
      if (session.messages.length === 0) sessions.delete(userId);
      else sessions.set(userId, session);
    }
    const errMsg =
      e.name === 'AbortError'
        ? 'انتهت مهلة الطلب. جرّب مرة ثانية.'
        : 'صار خطأ 😅';
    console.error(e.response?.data || e.message || e);
    try {
      await bot.sendMessage(chatId, errMsg);
    } catch {
      /* ignore */
    }
  } finally {
    clearTimeout(timeoutId);
    if (typingInterval) clearInterval(typingInterval);
  }
}
