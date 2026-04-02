/**
 * GET https://openrouter.ai/api/v1/credits
 * يتطلب مفتاح إدارة (Management key) حسب الوثائق؛ جرّب OPENROUTER_MANAGEMENT_KEY أو مفتاح الدردشة.
 * @param {AbortSignal} [signal]
 * @returns {Promise<unknown>}
 */
export async function fetchOpenRouterCredits(signal) {
  const key =
    process.env.OPENROUTER_MANAGEMENT_KEY || process.env.AI_API_KEY;
  if (!key) {
    throw new Error('ضع AI_API_KEY أو OPENROUTER_MANAGEMENT_KEY في البيئة.');
  }

  const res = await fetch('https://openrouter.ai/api/v1/credits', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${key}`
    },
    signal
  });

  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`OpenRouter credits: JSON غير صالح (${res.status})`);
  }

  if (!res.ok) {
    const msg = data?.error?.message || raw || res.statusText;
    throw new Error(`OpenRouter credits ${res.status}: ${msg}`);
  }

  return data;
}
