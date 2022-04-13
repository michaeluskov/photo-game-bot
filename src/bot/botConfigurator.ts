import { Context, Markup, Scenes, Telegraf } from "telegraf";
import { Db, MongoClient, ObjectId } from "mongodb";
const { session } = require("telegraf-session-mongodb");
import { injectable } from "tsyringe";
import { loadStream, uploadPhoto } from "./photoUploader";
import { url } from "telegraf/typings/button";

let database: Db;
const BOT_TOKEN = process.env["BOT_TOKEN"];

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
      await createNewTask(ctx, ctx.from.id);
      await ctx.scene.leave();
    });

    const sendPhotoScene = new Scenes.BaseScene<PhotoGameBotContext>(
      "sendPhoto"
    );
    sendPhotoScene.enter(async (ctx) => {
      const task = await database.collection("tasks").findOne<any>({
        _id: new ObjectId(ctx.session!.taskId)
      });
      if (!task || task.done) {
        await ctx.reply("По этой задаче уже есть отправка:(");
        await ctx.scene.leave();
      } else
      await ctx.reply(`Ждем фотку по заданию ${ctx.session?.taskId}`);
    });
    sendPhotoScene.command("exit", async (ctx) => {
      await ctx.reply("Хорошо, выходим");
      await ctx.scene.leave();
    });
    sendPhotoScene.hears(/.*/, async (ctx) => {
      const task = await database.collection("tasks").findOne<any>({
        _id: new ObjectId(ctx.session!.taskId),
      });
      const first = await database.collection("users").findOne<any>({
        telegram_id: task.first,
      });
      const second = await database.collection("users").findOne<any>({
        telegram_id: task.second,
      });
      await ctx.reply(
        `Ждем фотку по заданию ${task.task_name} (${first.name} + ${second.name})`
      );
    });
    sendPhotoScene.on("photo", async (ctx) => {
      if ((ctx.update.message as any).photo) {
        return handlePhotoUpdate(ctx);
      }
    });

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
    bot.hears("/gimmemoar", (ctx) => createNewTask(ctx, ctx.from.id));
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
    Omit<PhotoGameBotContext, keyof Context<import("typegram").Update>>,
    telegram_id: number
) {
  const db = await getDatabase();
  const user = await db.collection("users").findOne<any>({
    telegram_id: telegram_id,
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
    telegram_id,
    `ЗАДАНИЕ ${task.name}, игрок ${pair.name}`,
    inlineMessageRatingKeyboard(createdTask.insertedId.toString())
  );
}

const inlineMessageRatingKeyboard = (taskId: string) =>
  Markup.inlineKeyboard([
    Markup.button.callback("Отправить фотку", `send_photo${taskId}`),
  ]);

async function handlePhotoUpdate(
  ctx: Context<{
    message: import("typegram").Update.New &
      import("typegram").Update.NonChannel &
      import("typegram").Message.PhotoMessage;
    update_id: number;
  }> &
    Omit<PhotoGameBotContext, keyof Context<import("typegram").Update>>
) {
  const largestFile =
    ctx.update.message.photo[ctx.update.message.photo.length - 1];
  const largestFileId = largestFile.file_id;
  const file = await ctx.telegram.getFile(largestFileId);
  const splitted = file.file_path?.split('.');
  const extension = splitted ? splitted[splitted.length - 1] : 'png';
  const fileName = `${(ctx.session as any).taskId}.${extension}`;
  const photoUrl = await ctx.telegram.getFileLink(largestFileId);
  const buffer = await loadStream(photoUrl.toString());
  const uploadedUrl = await uploadPhoto(fileName, buffer);
  const task = await database.collection("tasks").findOne<any>({
    _id: new ObjectId(ctx.session!.taskId)
  });
  const updateResult = await database.collection("tasks").updateOne({
    _id: new ObjectId(ctx.session!.taskId)
  }, {
    $set: {
      done: 1,
      photo_url: uploadedUrl,
      done_datetime: new Date()
    }
  });
  const text = 'Круто, задание выполнено! Скоро тебе придет еще одно';
  await ctx.telegram.sendMessage(task.first, text);
  await ctx.telegram.sendMessage(task.second, text);
  await ctx.scene.leave();
  await createNewTask(ctx, task.first);
  await createNewTask(ctx, task.second);
}
