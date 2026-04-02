import TelegramBot from 'node-telegram-bot-api';
import axios from 'axios';

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text) return;

  try {
    await bot.sendChatAction(chatId, 'typing');

    const res = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'mistralai/mistral-7b-instruct:free',
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

    await bot.sendMessage(chatId, reply);

  } catch (e) {
    console.log(e.response?.data || e.message);
    bot.sendMessage(chatId, 'صار خطأ 😅');
  }
});