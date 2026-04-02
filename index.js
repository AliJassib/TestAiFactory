import TelegramBot from 'node-telegram-bot-api';

/** OpenRouter model: default picks any available free model (see https://openrouter.ai/docs/guides/routing/routers/free-router). */
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openrouter/free';

const SYSTEM_PROMPT =
  process.env.SYSTEM_PROMPT ||
  'أنت مساعد مفيد. أجب بلغة المستخدم وباختصار عندما يناسب السياق.';

const MAX_COMPLETION_TOKENS = Number(process.env.MAX_COMPLETION_TOKENS) || 4096;
/** Max user+assistant pairs kept in memory (after trim). */
const MAX_HISTORY_PAIRS = Number(process.env.MAX_HISTORY_PAIRS) || 15;

/** حد تيليغرام لطول الرسالة الواحدة */
const MAX_TELEGRAM_CHARS = 4096;
/**
 * أول جزء نرسله في رسالة جديدة؛ إن تجاوزت القطعة هذا الطول نُكمِل بنفس الرسالة عبر التعديل حتى MAX_TELEGRAM_CHARS.
 */
const MESSAGE_FIRST_CHUNK_CHARS =
  Number(process.env.MESSAGE_FIRST_CHUNK_CHARS) || 3000;

const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS) || 120000;

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

/** @type {Map<number, { messages: Array<{ role: 'user' | 'assistant'; content: string }> }>} */
const sessions = new Map();

function trimSessionMessages(messages) {
  const maxTurns = MAX_HISTORY_PAIRS * 2;
  if (messages.length <= maxTurns) return messages;
  return messages.slice(-maxTurns);
}

async function safeEditMessageText(chatId, messageId, text) {
  try {
    await bot.editMessageText(text, { chat_id: chatId, message_id: messageId });
  } catch (e) {
    const desc = e.response?.body?.description || e.message || '';
    if (String(desc).includes('message is not modified')) return;
    throw e;
  }
}

/**
 * تقسيم ذكي: كل فقاعة تيليغرام حتى MAX_TELEGRAM_CHARS.
 * إذا كانت القطعة أطول من MESSAGE_FIRST_CHUNK_CHARS نرسل أول جزء ثم نعدّل نفس الرسالة لإضافة الباقي (بدل إرسال 4096 دفعة واحدة كأول رسالة).
 */
async function sendReplyInSmartChunks(chatId, text) {
  if (!text.length) return;
  const firstStep = Math.min(MESSAGE_FIRST_CHUNK_CHARS, MAX_TELEGRAM_CHARS);
  let offset = 0;
  while (offset < text.length) {
    const end = Math.min(offset + MAX_TELEGRAM_CHARS, text.length);
    const segment = text.slice(offset, end);
    if (segment.length <= firstStep) {
      await bot.sendMessage(chatId, segment);
    } else {
      const sent = await bot.sendMessage(chatId, segment.slice(0, firstStep));
      await safeEditMessageText(chatId, sent.message_id, segment);
    }
    offset = end;
  }
}

bot.on('message', async (msg) => {
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

    const apiMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...session.messages.map((m) => ({ role: m.role, content: m.content }))
    ];

    await bot.sendChatAction(chatId, 'typing');
    typingInterval = setInterval(() => {
      bot.sendChatAction(chatId, 'typing').catch(() => {});
    }, 4000);

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.AI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: apiMessages,
        max_completion_tokens: MAX_COMPLETION_TOKENS,
        user: `telegram-${userId}`,
        session_id: `tg-${userId}`
      })
    });

    const raw = await res.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(`OpenRouter: invalid JSON (${res.status})`);
    }

    if (!res.ok) {
      throw new Error(
        `OpenRouter ${res.status}: ${data?.error?.message || raw || res.statusText}`
      );
    }

    let fullText = data.choices?.[0]?.message?.content;
    if (typeof fullText !== 'string') fullText = '';
    const finishReason = data.choices?.[0]?.finish_reason;

    if (typingInterval) {
      clearInterval(typingInterval);
      typingInterval = undefined;
    }

    if (!fullText.trim()) {
      await bot.sendMessage(chatId, 'لم يُرجع النموذج نصاً.');
      session.messages.pop();
      if (session.messages.length === 0) sessions.delete(userId);
      else sessions.set(userId, session);
      return;
    }

    if (finishReason === 'length') {
      fullText +=
        '\n\n— توقف الرد عند حد الطول. يمكنك طلب المتابعة في رسالة جديدة.';
    }

    await sendReplyInSmartChunks(chatId, fullText);

    session.messages.push({ role: 'assistant', content: fullText });
    session.messages = trimSessionMessages(session.messages);
    sessions.set(userId, session);
    assistantSaved = true;
  } catch (e) {
    if (session && !assistantSaved) {
      session.messages.pop();
      if (session.messages.length === 0) sessions.delete(userId);
      else sessions.set(userId, session);
    }
    const errMsg =
      e.name === 'AbortError'
        ? 'انتهت مهلة الطلب. جرّب مرة ثانية.'
        : 'صار خطأ 😅';
    console.error(e.response?.data || e.message || e);
    try {
      await bot.sendMessage(chatId, errMsg + '\n\n' + e.message);
    } catch {
      /* ignore */
      await bot.sendMessage(chatId, e.message);
    }
  } finally {
    clearTimeout(timeoutId);
    if (typingInterval) clearInterval(typingInterval);
  }
});
