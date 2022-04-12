import { Context, Telegraf } from "telegraf";
const { MongoClient } = require("mongodb");
const { session } = require("telegraf-session-mongodb");
import { injectable } from "tsyringe";

export async function getDatabase() {
  const client = new MongoClient(process.env.MONGO_URL);
  await client.connect();
  return client.db();
}

export interface LinguaBotContext extends Context {
}

@injectable()
export class BotConfigurator {
  isConfigured: boolean = false;

  async configureBot(bot: Telegraf<LinguaBotContext>) {
    this.isConfigured = true;

    const database = await getDatabase();
    bot.use(session(database, { collectionName: 'sessions' }));

    
    bot.start((ctx) => ctx.reply("ЖОПА"));
    bot.hears(/.*/, (ctx) => ctx.reply("ЧЕ?"));

    return bot;
  }
}
