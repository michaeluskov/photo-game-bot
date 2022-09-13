import "reflect-metadata";
require("dotenv").config();
import { Telegraf } from "telegraf";
import { container } from "tsyringe";
import { BotConfigurator, PhotoGameBotContext } from "./src/botConfigurator";

const bot = new Telegraf<PhotoGameBotContext>(process.env["BOT_TOKEN"] || "", {
  telegram: { webhookReply: false },
});

const botConfigurator = container.resolve(BotConfigurator);
const configuredPromise = botConfigurator.configureBot(bot);

module.exports.handler = async (event: any, context: any) => {
  try {
    context.callbackWaitsForEmptyEventLoop = false;
    await configuredPromise;
    await bot.handleUpdate(JSON.parse(event.body));
    return { statusCode: 200 };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: JSON.stringify(e) };
  }
};
