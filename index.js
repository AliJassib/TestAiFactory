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

/** أزرار لكل صفحة في قائمة الموديلات */
const MODELS_PAGE_SIZE = 8;
const MODELS_CACHE_TTL_MS = 30 * 60 * 1000;
/** طول نص زر تيليغرام (حد أقصى 64 حرفاً) */
const BUTTON_LABEL_MAX = 40;

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

/** @type {Map<number, { messages: Array<{ role: 'user' | 'assistant'; content: string }> }>} */
const sessions = new Map();

/** @type {Map<number, string>} معرف المستخدم → معرف الموديل في OpenRouter */
const userSelectedModel = new Map();

let modelsListCache = { entries: [], fetchedAt: 0 };

function trimSessionMessages(messages) {
  const maxTurns = MAX_HISTORY_PAIRS * 2;
  if (messages.length <= maxTurns) return messages;
  return messages.slice(-maxTurns);
}

function getModelForUser(userId) {
  return userSelectedModel.get(userId) ?? OPENROUTER_MODEL;
}

function truncateLabel(s, max = BUTTON_LABEL_MAX) {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

async function fetchModelsEntries() {
  const res = await fetch(
    'https://openrouter.ai/api/v1/models?output_modalities=text',
    {
      headers: { Authorization: `Bearer ${process.env.AI_API_KEY}` }
    }
  );
  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('فشل قراءة قائمة الموديلات');
  }
  if (!res.ok) {
    throw new Error(
      data?.error?.message || data?.message || `HTTP ${res.status}`
    );
  }
  const arr = Array.isArray(data.data) ? data.data : [];
  const entries = arr
    .filter((m) => {
      const out = m.architecture?.output_modalities;
      return Array.isArray(out) && out.includes('text');
    })
    .map((m) => ({ id: m.id, name: m.name || m.id }))
    .sort((a, b) => a.name.localeCompare(b.name));
  modelsListCache = { entries, fetchedAt: Date.now() };
  return entries;
}

async function getModelsEntriesCached() {
  if (
    Date.now() - modelsListCache.fetchedAt < MODELS_CACHE_TTL_MS &&
    modelsListCache.entries.length
  ) {
    return modelsListCache.entries;
  }
  return fetchModelsEntries();
}

async function buildModelsPage(userId, page) {
  const entries = await getModelsEntriesCached();
  if (!entries.length) {
    return { text: 'ماكو موديلات نصية متاحة.', keyboard: [] };
  }
  const totalPages = Math.max(1, Math.ceil(entries.length / MODELS_PAGE_SIZE));
  const p = Math.max(0, Math.min(page, totalPages - 1));
  const start = p * MODELS_PAGE_SIZE;
  const slice = entries.slice(start, start + MODELS_PAGE_SIZE);
  const current = getModelForUser(userId);

  const text =
    `📋 الموديلات (صفحة ${p + 1}/${totalPages})\n` +
    `المختار حالياً:\n${current}\n\n` +
    `اضغط زرًا لاختيار موديل:`;

  const keyboard = [];
  for (let i = 0; i < slice.length; i += 2) {
    const row = [
      {
        text: truncateLabel(slice[i].name),
        callback_data: `m:${start + i}`
      }
    ];
    if (slice[i + 1]) {
      row.push({
        text: truncateLabel(slice[i + 1].name),
        callback_data: `m:${start + i + 1}`
      });
    }
    keyboard.push(row);
  }
  const nav = [];
  if (p > 0) nav.push({ text: '« السابق', callback_data: `p:${p - 1}` });
  if (p < totalPages - 1)
    nav.push({ text: 'التالي »', callback_data: `p:${p + 1}` });
  if (nav.length) keyboard.push(nav);

  return { text, keyboard };
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

bot.on('callback_query', async (q) => {
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
      userSelectedModel.set(userId, picked.id);
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
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userId = msg.from?.id;
  if (!text || userId == null) return;

  const parts = text.trim().split(/\s+/);
  const cmd0 = parts[0].includes('@')
    ? parts[0].split('@')[0]
    : parts[0];

  if (cmd0 === '/models') {
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
    return;
  }

  if (cmd0 === '/mymodel') {
    await bot.sendMessage(
      chatId,
      `الموديل الحالي:\n${getModelForUser(userId)}`
    );
    return;
  }

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

    const model = getModelForUser(userId);

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.AI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
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
      await bot.sendMessage(chatId, errMsg);
    } catch {
      /* ignore */
    }
  } finally {
    clearTimeout(timeoutId);
    if (typingInterval) clearInterval(typingInterval);
  }
});
