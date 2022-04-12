import "reflect-metadata";
require('dotenv').config()
import { Telegraf } from 'telegraf';
import { container } from "tsyringe";
import { BotConfigurator, LinguaBotContext } from "./src/bot/botConfigurator";

const bot = new Telegraf<LinguaBotContext>(process.env['BOT_TOKEN'] || "");

const botConfigurator = container.resolve(BotConfigurator);
botConfigurator.configureBot(bot).then(() => {
    console.log("Starting");
    bot.launch();
});