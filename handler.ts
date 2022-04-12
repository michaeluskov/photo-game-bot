import "reflect-metadata";
import mongoose from "mongoose";
require("dotenv").config();
import { Telegraf } from "telegraf";
import { container } from "tsyringe";
import { BotConfigurator, PhotoGameBotContext } from "./src/bot/botConfigurator";

mongoose.set("debug", true);

const bot = new Telegraf<PhotoGameBotContext>(process.env["BOT_TOKEN"] || "", {
  telegram: { webhookReply: false },
});

const botConfigurator = container.resolve(BotConfigurator);
botConfigurator.configureBot(bot);

module.exports.handler = async (event: any) => {
  try {
    if (!botConfigurator.isConfigured) {
      await botConfigurator.configureBot(bot);
    }
    await bot.handleUpdate(JSON.parse(event.body));
    return { statusCode: 200 };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: JSON.stringify(e) };
  }
};
