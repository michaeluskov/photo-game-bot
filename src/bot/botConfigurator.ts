import { Context, Scenes, Telegraf } from "telegraf";
import { MongoClient } from "mongodb";
const { session } = require("telegraf-session-mongodb");
import { injectable } from "tsyringe";

export async function getDatabase() {
  const client = new MongoClient(process.env.MONGO_URL || "");
  await client.connect();
  return client.db();
}

export interface PhotoGameBotContext extends Context {
  myContextProp: string;

  // declare scene type
  scene: Scenes.SceneContextScene<PhotoGameBotContext>;
}

@injectable()
export class BotConfigurator {
  isConfigured: boolean = false;

  async configureBot(bot: Telegraf<PhotoGameBotContext>) {
    this.isConfigured = true;

    const database = await getDatabase();
    bot.use(session(database, { collectionName: "sessions" }));

    const { enter, leave } = Scenes.Stage;

    // Greeter scene
    const greeterScene = new Scenes.BaseScene<PhotoGameBotContext>("greeter");
    greeterScene.enter((ctx) => ctx.reply("Для начала давай представимся. Напиши, как тебя зовут"));
    greeterScene.on("message", async (ctx) => {
      const name = (ctx.message as any).text;
      await database.collection("users").insertOne({
        telegram_id: ctx.message.from.id,
        name
      });
      await ctx.reply(`Хорошо, ${name}. Приятно познакомиться!`);
      await ctx.scene.leave();
    });

    const stage = new Scenes.Stage<PhotoGameBotContext>([greeterScene], {
      ttl: 10,
    });
    bot.use(stage.middleware());
    bot.use((ctx, next) => {
      // we now have access to the the fields defined above
      ctx.myContextProp ??= "";
      return next();
    });
    bot.command("greeter", (ctx) => ctx.scene.enter("greeter"));
    bot.on("message", async (ctx) => {
      const database = await getDatabase();
      const user = await database.collection("users").findOne<any>({
        telegram_id: ctx.message.from.id
      });
      if (!user) {
        ctx.scene.enter("greeter");
      } else {
        ctx.reply(`ПРИВЕТ, ${user.name}`);
      }
    });

    return bot;
  }
}
