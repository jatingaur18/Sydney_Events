require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const getRecommendationsFromGemini = require("./gemini");
const axios = require("axios");

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userPreference = msg.text;

  try {
    const res = await axios.get("http://localhost:3000/api/events");
    const events = res.data.events; 

    const recommendations = await getRecommendationsFromGemini(userPreference, events);

    let replyText = "Here are the top 3 events I found:\n\n";
    recommendations.forEach((ev, idx) => {
      replyText += `${idx + 1}. *${ev.title}*\n`;
      replyText += `<a href="${ev.link}">🔗 View Details</a>\n`;
      replyText += `_${ev.explanation}_\n\n`;
    });


    bot.sendMessage(chatId, replyText, { parse_mode: "HTML" });
  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, "Sorry, something went wrong while fetching events.");
  }
});
