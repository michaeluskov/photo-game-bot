import { Context, Markup, Scenes, Telegraf } from "telegraf";
import { ObjectId } from "mongodb";
const { session } = require("telegraf-session-mongodb");
import { injectable } from "tsyringe";
import { loadStream, uploadPhoto } from "./photoUploader";
import { url } from "telegraf/typings/button";
import { getDatabase, database } from "./database";
import { helloText } from "./texts";

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

    bot.use(async (ctx, next) => {
      try {
        await next();
      } catch (e) {
        console.error(e);
      }
    });
    bot.use(session(database, { collectionName: "sessions" }));

    const { enter, leave } = Scenes.Stage;

    // Greeter scene
    const greeterScene = new Scenes.BaseScene<PhotoGameBotContext>("greeter");
    greeterScene.enter((ctx) =>
      ctx.replyWithHTML(
        "Для начала давай представимся. Напиши, как тебя зовут (например, <b>Яночка Конева</b>)"
      )
    );
    greeterScene.on("message", async (ctx) => {
      const name = (ctx.message as any).text;
      await database.collection("users").findOneAndReplace(
        {
          telegam_id: ctx.message.from.id,
        },
        {
          telegram_id: ctx.message.from.id,
          name,
        },
        {
          upsert: true,
        }
      );
      await ctx.reply(
        `Хорошо, ${name}. Приятно познакомиться! Скоро тебе придут первые задания`
      );
      await ctx.scene.leave();
      await createNewTask(ctx, ctx.from.id);
    });

    const sendPhotoScene = new Scenes.BaseScene<PhotoGameBotContext>(
      "sendPhoto"
    );
    sendPhotoScene.enter(async (ctx) => {
      const task = await database.collection("tasks").findOne<any>({
        _id: new ObjectId(ctx.session!.taskId),
      });
      if (!task || task.done) {
        await ctx.reply("По этой задаче уже есть отправка:(");
        await ctx.scene.leave();
      } else await sendPhotoGreeting(ctx);
    });
    sendPhotoScene.command("exit", async (ctx) => {
      await ctx.reply("Хорошо, выходим");
      await ctx.scene.leave();
    });
    sendPhotoScene.hears(/.*/, sendPhotoGreeting);
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
    bot.hears("/help", (ctx) => ctx.replyWithHTML(helloText));
    bot.hears("/more", (ctx) => createNewTask(ctx, ctx.from.id));
    bot.on("message", async (ctx) => {
      await ctx.replyWithHTML(helloText);
      const user = await database.collection("users").findOne<any>({
        telegram_id: ctx.message.from.id,
      });
      if (!user) await ctx.scene.enter("greeter");
    });

    return bot;
  }
}

async function sendPhotoGreeting(ctx: any) {
  const task = await database.collection("tasks").findOne<any>({
    _id: new ObjectId(ctx.session!.taskId),
  });
  const first = await database.collection("users").findOne<any>({
    telegram_id: task.first,
  });
  const second = await database.collection("users").findOne<any>({
    telegram_id: task.second,
  });
  await ctx.replyWithHTML(
    `Ждем фотку по заданию <b>${task.task_name}</b> (<b>${first.name}</b> + <b>${second.name}</b>)\n\nЕсли не хочешь отправлять, нажми /exit`
  );
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
    .skip(Math.max(Math.floor(Math.random() * tasks_count), 0))
    .limit(1)
    .toArray();
  if (taskArray.length == 0) return;
  const task = taskArray[0];
  const users_count = await db.collection("users").countDocuments();
  const pairArray = await db
    .collection("users")
    .find<any>({
      telegram_id: {
        $not: {
          $eq: telegram_id,
        },
      },
    })
    .skip(Math.max(Math.floor(Math.random() * users_count - 1), 0))
    .limit(1)
    .toArray();
  if (pairArray.length == 0) return;
  const pair = pairArray[0];
  const createdTask = await db.collection("tasks").insertOne({
    first: user.telegram_id,
    second: pair.telegram_id,
    task_name: task.name,
  });
  ctx.telegram.sendMessage(
    telegram_id,
    `<b>Новое задание!</b>\n\nТема: <b>${task.name}</b>\nНапарник: <b>${pair.name}</b>\n\nЕсли хочешь еще, жми /more`,
    {
      ...inlineMessageRatingKeyboard(createdTask.insertedId.toString()),
      parse_mode: 'HTML'
    }
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
  const splitted = file.file_path?.split(".");
  const extension = splitted ? splitted[splitted.length - 1] : "png";
  const fileName = `${(ctx.session as any).taskId}.${extension}`;
  const photoUrl = await ctx.telegram.getFileLink(largestFileId);
  const buffer = await loadStream(photoUrl.toString());
  const uploadedUrl = await uploadPhoto(fileName, buffer);
  const task = await database.collection("tasks").findOne<any>({
    _id: new ObjectId(ctx.session!.taskId),
  });
  const updateResult = await database.collection("tasks").updateOne(
    {
      _id: new ObjectId(ctx.session!.taskId),
    },
    {
      $set: {
        done: 1,
        photo_url: uploadedUrl,
        done_datetime: new Date(),
      },
    }
  );
  const text = `Круто, задание <b>${task.task_name}</b> выполнено! Скоро тебе придет еще одно`;
  await ctx.telegram.sendMessage(task.first, text, {parse_mode: 'HTML'});
  await ctx.telegram.sendMessage(task.second, text, {parse_mode: 'HTML'});
  await ctx.scene.leave();
  await createNewTask(ctx, task.first);
  await createNewTask(ctx, task.second);
}
