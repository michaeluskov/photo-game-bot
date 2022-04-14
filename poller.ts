import "reflect-metadata";
require('dotenv').config()
import { Telegraf } from 'telegraf';
import { container } from "tsyringe";
import { BotConfigurator, PhotoGameBotContext } from "./src/botConfigurator";

const bot = new Telegraf<PhotoGameBotContext>(process.env['BOT_TOKEN'] || "");

const botConfigurator = container.resolve(BotConfigurator);
botConfigurator.configureBot(bot);
console.log("Starting");
bot.launch();