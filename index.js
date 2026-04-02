import TelegramBot from 'node-telegram-bot-api';
import axios from 'axios';

/** OpenRouter model: default picks any available free model (see https://openrouter.ai/docs/guides/routing/routers/free-router). */
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openrouter/free';

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text) return;
  let typingInterval;
  const MAX_CHARS = 4000;
  function splitIntoChunks(text, maxChars) {
    const chunks = [];
    for (let i = 0; i < text.length; i += maxChars) {
      chunks.push(text.slice(i, i + maxChars));
    }
    return chunks.length ? chunks : [''];
  }
  try {
    await bot.sendChatAction(chatId, 'typing');
    typingInterval = setInterval(() => {
        bot.sendChatAction(chatId, 'typing').catch(() => {});
      }, 4000);
    const res = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: OPENROUTER_MODEL,
        messages: [{ role: 'user', content: text }]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.AI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const reply = res.data.choices[0].message.content;

    const chunks = splitIntoChunks(reply, MAX_TELEGRAM_CHARS);
    for (const chunk of chunks) {
      await bot.sendMessage(chatId, chunk);
    }

  } catch (e) {
    console.log(e.response?.data || e.message);
    bot.sendMessage(chatId, 'صار خطأ 😅');
  }finally {
    if (typingInterval) clearInterval(typingInterval);
  }
});