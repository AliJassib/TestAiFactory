import { MODELS_PAGE_SIZE } from '../../../config.js';
import { getModelsEntriesCached } from './cache.js';
import { getModelForUser } from '../../../state/userModel.js';
import { truncateLabel } from '../../../utils/text.js';

export async function buildModelsPage(userId, page) {
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
