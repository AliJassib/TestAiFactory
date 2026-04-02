import TelegramBot from 'node-telegram-bot-api';

/** OpenRouter model: default picks any available free model (see https://openrouter.ai/docs/guides/routing/routers/free-router). */
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openrouter/free';

const SYSTEM_PROMPT =
  process.env.SYSTEM_PROMPT ||
  'أنت مساعد مفيد. أجب بلغة المستخدم وباختصار عندما يناسب السياق.';

const MAX_COMPLETION_TOKENS = Number(process.env.MAX_COMPLETION_TOKENS) || 4096;
/** Max user+assistant pairs kept in memory (after trim). */
const MAX_HISTORY_PAIRS = Number(process.env.MAX_HISTORY_PAIRS) || 15;

const THROTTLE_MS = Number(process.env.STREAM_EDIT_THROTTLE_MS) || 600;
const MAX_TELEGRAM_CHARS = 4096;

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

/** @type {Map<number, { messages: Array<{ role: 'user' | 'assistant'; content: string }> }>} */
const sessions = new Map();

function trimSessionMessages(messages) {
  const maxTurns = MAX_HISTORY_PAIRS * 2;
  if (messages.length <= maxTurns) return messages;
  return messages.slice(-maxTurns);
}

function splitForTelegram(text) {
  const parts = [];
  for (let i = 0; i < text.length; i += MAX_TELEGRAM_CHARS) {
    parts.push(text.slice(i, i + MAX_TELEGRAM_CHARS));
  }
  return parts.length ? parts : [''];
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

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userId = msg.from?.id;
  if (!text || userId == null) return;

  let typingInterval;
  let streamEditInterval = null;
  let placeholderMessageId = null;
  let session = null;
  let assistantSaved = false;
  const controller = new AbortController();
  const streamTimeoutMs = Number(process.env.STREAM_TIMEOUT_MS) || 120000;
  const timeoutId = setTimeout(() => controller.abort(), streamTimeoutMs);

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

    const placeholder = await bot.sendMessage(chatId, '…');
    placeholderMessageId = placeholder.message_id;
    const messageIds = [placeholder.message_id];

    let fullText = '';
    let finishReason = null;
    let lastShown = '';

    const applyEdits = async () => {
      if (fullText === lastShown) return;
      const parts = splitForTelegram(fullText);
      for (let i = 0; i < parts.length; i++) {
        if (!messageIds[i]) {
          const sent = await bot.sendMessage(chatId, parts[i] || '…');
          messageIds[i] = sent.message_id;
        } else {
          await safeEditMessageText(chatId, messageIds[i], parts[i]);
        }
      }
      lastShown = fullText;
    };

    /** تحديثات تيليغرام منفصلة عن قراءة الـ stream — لا نوقف استلام الشبكة. */
    const startEditPump = () => {
      if (streamEditInterval != null) return;
      applyEdits().catch(() => {});
      streamEditInterval = setInterval(() => {
        applyEdits().catch(() => {});
      }, THROTTLE_MS);
    };

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
        stream: true,
        max_completion_tokens: MAX_COMPLETION_TOKENS,
        user: `telegram-${userId}`,
        session_id: `tg-${userId}`
      })
    });

    if (!res.ok) {
      let errText = '';
      try {
        errText = await res.text();
      } catch {
        errText = res.statusText;
      }
      throw new Error(`OpenRouter ${res.status}: ${errText}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let sseBuffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      sseBuffer += decoder.decode(value, { stream: true });
      const lines = sseBuffer.split('\n');
      sseBuffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta.length) {
            fullText += delta;
            if (typingInterval) {
              clearInterval(typingInterval);
              typingInterval = undefined;
            }
            startEditPump();
          }
          const fr = json.choices?.[0]?.finish_reason;
          if (fr) finishReason = fr;
        } catch {
          // ignore
        }
      }
    }

    if (streamEditInterval != null) {
      clearInterval(streamEditInterval);
      streamEditInterval = null;
    }
    await applyEdits();

    if (!fullText.trim()) {
      await safeEditMessageText(
        chatId,
        placeholderMessageId,
        'لم يُرجع النموذج نصاً.'
      );
      session.messages.pop();
      if (session.messages.length === 0) sessions.delete(userId);
      else sessions.set(userId, session);
      return;
    }

    if (finishReason === 'length') {
      const tail =
        '\n\n— توقف الرد عند حد الطول. يمكنك طلب المتابعة في رسالة جديدة.';
      fullText += tail;
      const parts = splitForTelegram(fullText);
      for (let i = 0; i < parts.length; i++) {
        if (!messageIds[i]) {
          const sent = await bot.sendMessage(chatId, parts[i]);
          messageIds[i] = sent.message_id;
        } else {
          await safeEditMessageText(chatId, messageIds[i], parts[i]);
        }
      }
    }

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
      if (placeholderMessageId != null) {
        await safeEditMessageText(chatId, placeholderMessageId, errMsg);
      } else {
        await bot.sendMessage(chatId, errMsg);
      }
    } catch {
      /* ignore */
    }
  } finally {
    clearTimeout(timeoutId);
    if (typingInterval) clearInterval(typingInterval);
    if (streamEditInterval != null) {
      clearInterval(streamEditInterval);
      streamEditInterval = null;
    }
  }
});
