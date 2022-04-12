import { Context, Scenes, Telegraf } from "telegraf";
import { MongoClient } from "mongodb";
const { session } = require("telegraf-session-mongodb");
import { injectable } from "tsyringe";
import { Db } from "mongoose/node_modules/mongodb";

let database: Db;

export async function getDatabase() {
  if (database)
  return database;
  const client = new MongoClient(process.env.MONGO_URL || "");
  await client.connect();
  database = client.db();
  return database
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
    greeterScene.enter((ctx) =>
      ctx.reply("Для начала давай представимся. Напиши, как тебя зовут")
    );
    greeterScene.on("message", async (ctx) => {
      const name = (ctx.message as any).text;
      await database.collection("users").insertOne({
        telegram_id: ctx.message.from.id,
        name,
      });
      await ctx.reply(`Хорошо, ${name}. Приятно познакомиться!`);
      await createNewTask(ctx);
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
    bot.hears("/help", (ctx) => ctx.reply("ХЭЛП"));
    bot.hears("/more", (ctx) => createNewTask(ctx));
    bot.on("message", async (ctx) => {
      const database = await getDatabase();
      const user = await database.collection("users").findOne<any>({
        telegram_id: ctx.message.from.id,
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

async function createNewTask(
  ctx: Context<import("typegram").Update.MessageUpdate> &
    Omit<PhotoGameBotContext, keyof Context<import("typegram").Update>>
) {
  const db = await getDatabase();
  const user = await db.collection("users").findOne({
    telegram_id: ctx.message.from.id,
  });
  const tasks_count = await db.collection("task_themes").countDocuments();
  const taskArray = await db
    .collection("task_themes")
    .find<any>({})
    .skip(Math.floor(Math.random() * tasks_count))
    .limit(1)
    .toArray();
  const task = taskArray[0];
  const users_count = await db.collection("users").countDocuments();
  const pairArray = await db
    .collection("users")
    .find<any>({})
    .skip(Math.floor(Math.random() * users_count))
    .limit(1)
    .toArray();
  const pair = pairArray[0];
  ctx.reply(`ЗАДАНИЕ ${task.name}, игрок ${pair.name}`);
}
