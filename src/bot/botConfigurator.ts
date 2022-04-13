import { Context, Markup, Scenes, Telegraf } from "telegraf";
import { Db, MongoClient } from "mongodb";
const { session } = require("telegraf-session-mongodb");
import { injectable } from "tsyringe";

let database: Db;

export async function getDatabase() {
  if (database) return database;
  const client = new MongoClient(process.env.MONGO_URL || "");
  await client.connect();
  database = client.db();
  return database;
}

export interface PhotoGameBotSession
  extends Scenes.SceneSession<PhotoGameBotContext> {
  taskId: string;
}

export interface PhotoGameBotContext extends Context {
  myContextProp: string;
  session?: PhotoGameBotSession;
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

    const sendPhotoScene = new Scenes.BaseScene<PhotoGameBotContext>(
      "sendPhoto"
    );
    sendPhotoScene.enter(async (ctx) => {
      await ctx.reply(`Ждем фотку по заданию ${ctx.session?.taskId}`);
    });
    sendPhotoScene.command("exit", async (ctx) => {
      await ctx.reply("Хорошо, выходим");
      await ctx.scene.leave();
    });
    sendPhotoScene.hears(/.*/, async (ctx) => {
      await ctx.reply(`Ждем фотку по заданию ${ctx.session?.taskId}`);
    })

    const stage = new Scenes.Stage<PhotoGameBotContext>(
      [greeterScene, sendPhotoScene],
      {
        ttl: 10000,
      }
    );
    bot.use(stage.middleware());
    bot.use((ctx, next) => {
      // we now have access to the the fields defined above
      ctx.myContextProp ??= "";
      return next();
    });
    bot.command("greeter", (ctx) => ctx.scene.enter("greeter"));
    bot.action(/send_photo/, async (ctx) => {
      await ctx.answerCbQuery();
      const actionData = (ctx.callbackQuery as any).data;
      const taskId = actionData.replace("send_photo", "");
      ctx.session!.taskId = taskId;
      await ctx.scene.enter("sendPhoto");
    });
    bot.hears("/help", (ctx) => ctx.reply("ХЭЛП"));
    bot.hears("/gimmemoar", (ctx) => createNewTask(ctx));
    bot.on("message", async (ctx) => {
      const database = await getDatabase();
      const user = await database.collection("users").findOne<any>({
        telegram_id: ctx.message.from.id,
      });
      if (!user) {
        await ctx.scene.enter("greeter");
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
  const user = await db.collection("users").findOne<any>({
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
  const createdTask = await db.collection("tasks").insertOne({
    first: user.telegram_id,
    second: pair.telegram_id,
    task_name: task.name,
  });
  ctx.telegram.sendMessage(
    ctx.from.id,
    `ЗАДАНИЕ ${task.name}, игрок ${pair.name}`,
    inlineMessageRatingKeyboard(createdTask.insertedId.toString())
  );
}

const inlineMessageRatingKeyboard = (taskId: string) => Markup.inlineKeyboard([
  Markup.button.callback("Отправить фотку", `send_photo${taskId}`),
]);
