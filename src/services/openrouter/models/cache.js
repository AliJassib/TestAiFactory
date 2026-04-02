import { MODELS_CACHE_TTL_MS } from '../../../config.js';

let modelsListCache = { entries: [], fetchedAt: 0 };

function setModelsCache(entries, fetchedAt = Date.now()) {
  modelsListCache = { entries, fetchedAt };
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
  setModelsCache(entries);
  return entries;
}

export async function getModelsEntriesCached() {
  if (
    Date.now() - modelsListCache.fetchedAt < MODELS_CACHE_TTL_MS &&
    modelsListCache.entries.length
  ) {
    return modelsListCache.entries;
  }
  return fetchModelsEntries();
}
