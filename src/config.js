/** إعدادات من البيئة */

export const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || 'openrouter/free';

export const SYSTEM_PROMPT =
  process.env.SYSTEM_PROMPT ||
  'أنت مساعد مفيد. أجب بلغة المستخدم وباختصار عندما يناسب السياق.';

export const MAX_COMPLETION_TOKENS =
  Number(process.env.MAX_COMPLETION_TOKENS) || 4096;

export const MAX_HISTORY_PAIRS =
  Number(process.env.MAX_HISTORY_PAIRS) || 15;

export const MAX_TELEGRAM_CHARS = 4096;

export const MESSAGE_FIRST_CHUNK_CHARS =
  Number(process.env.MESSAGE_FIRST_CHUNK_CHARS) || 3000;

export const REQUEST_TIMEOUT_MS =
  Number(process.env.REQUEST_TIMEOUT_MS) || 120000;

export const MODELS_PAGE_SIZE = 8;
export const MODELS_CACHE_TTL_MS = 30 * 60 * 1000;
export const BUTTON_LABEL_MAX = 40;
