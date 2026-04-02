import { MAX_COMPLETION_TOKENS } from '../../config.js';

/**
 * @param {object} opts
 * @param {string} opts.model
 * @param {string} opts.userId
 * @param {Array<{ role: string; content: string }>} opts.messages
 * @param {AbortSignal} [opts.signal]
 */
export async function completeChat({ model, userId, messages, signal }) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.AI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    signal,
    body: JSON.stringify({
      model,
      messages,
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
  console.log(data.choices?.[0]?.message);
  if (typeof fullText !== 'string') fullText = '';
  const finishReason = data.choices?.[0]?.finish_reason;

  return { fullText, finishReason };
}
