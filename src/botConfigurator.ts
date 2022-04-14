import { Context, Markup, Scenes, Telegraf } from "telegraf";
import { ObjectId } from "mongodb";
const { session } = require("telegraf-session-mongodb");
import { injectable } from "tsyringe";
import { loadStream, uploadPhoto } from "./photoUploader";
import { url } from "telegraf/typings/button";
import { getDatabase } from "./database";
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
  async configureBot(bot: Telegraf<PhotoGameBotContext>) {
    bot.use(async (ctx, next) => {
      try {
        await next();
      } catch (e) {
        console.error(e);
      }
    });
    bot.use(session(await getDatabase(), { collectionName: "sessions" }));

    // Greeter scene
    const greeterScene = new Scenes.BaseScene<PhotoGameBotContext>("greeter");
    greeterScene.enter((ctx) =>
      ctx.replyWithHTML(
        "Для начала давай представимся. Напиши, как тебя зовут (например, <b>Яночка Конева</b>)"
      )
    );
    greeterScene.on("message", async (ctx) => {
      const name = (ctx.message as any).text;
      await (await getDatabase()).collection("users").findOneAndReplace(
        {
          telegram_id: ctx.message.from.id,
        },
        {
          telegram_id: ctx.message.from.id,
          is_absent: true,
          name,
        },
        {
          upsert: true,
        }
      );
      await ctx.replyWithHTML(
        `Хорошо, ${name}. Приятно познакомиться!\n\nЕсли ты на выезде, запусти /enable, чтобы тебе начали приходить новые задания. Когда будешь уезжать (или не сможешь играть), выполни /disable`
      );
      await ctx.scene.leave();
    });

    const sendPhotoScene = new Scenes.BaseScene<PhotoGameBotContext>(
      "sendPhoto"
    );
    sendPhotoScene.enter(async (ctx) => {
      const task = await (await getDatabase())
        .collection("tasks")
        .findOne<any>({
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
    bot.hears("/enable", async (ctx) => {
      const database = await getDatabase();
      await database.collection("users").findOneAndUpdate(
        {
          telegram_id: ctx.message.from.id,
        },
        {
          $set: { is_absent: false },
        }
      );
      await ctx.replyWithHTML(
        "Ура! Скоро тебе будут приходить новые задания.\n\nЧтобы получить новое задание прямо сейчас, запусти /more\nЕсли вдруг ты уедешь, то не забудь выполнить /disable"
      );
    });
    bot.hears("/disable", async (ctx) => {
      const database = await getDatabase();
      await database.collection("users").findOneAndUpdate(
        {
          telegram_id: ctx.message.from.id,
        },
        {
          $set: { is_absent: true },
        }
      );
      await ctx.replyWithHTML(
        "Хорошо, я больше не буду присылать тебе задания :(\n\nЧтобы опять начать игру, запусти /enable"
      );
    });
    bot.hears(/.*/, async (ctx) => {
      await ctx.replyWithHTML(helloText);
      const user = await (await getDatabase())
        .collection("users")
        .findOne<any>({
          telegram_id: ctx.message.from.id,
        });
      if (!user) await ctx.scene.enter("greeter");
    });

    return bot;
  }
}

async function sendPhotoGreeting(ctx: any) {
  const task = await (await getDatabase()).collection("tasks").findOne<any>({
    _id: new ObjectId(ctx.session!.taskId),
  });
  const first = await (await getDatabase()).collection("users").findOne<any>({
    telegram_id: task.first,
  });
  const second = await (await getDatabase()).collection("users").findOne<any>({
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
  const users_count = await db.collection("users").countDocuments({
    is_absent: false,
  });
  const pairArray = await db
    .collection("users")
    .find<any>({
      is_absent: false,
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
  const messageText = (pairUser: any) =>
    `<b>Новое задание!</b>\n\nТема: <b>${task.name}</b>\n` +
    `Напарник: <b>${pairUser.name}</b>\n\nЕсли хочешь еще, жми /more. Когда получаешь новое задание, старое все так же можно сдать\n\nЕсли ты уже не на выезде и больше не хочешь получать новые задания, жми /disable`;
  const userMessage = await ctx.telegram.sendMessage(telegram_id, messageText(pair), {
    ...inlineMessageRatingKeyboard(createdTask.insertedId.toString()),
    parse_mode: "HTML",
  });
  await ctx.telegram.pinChatMessage(telegram_id, userMessage.message_id);
  const pairMessage = await ctx.telegram.sendMessage(pair.telegram_id, messageText(user), {
    ...inlineMessageRatingKeyboard(createdTask.insertedId.toString()),
    parse_mode: "HTML",
  });
  await ctx.telegram.pinChatMessage(pair.telegram_id, pairMessage.message_id);
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
  const task = await (await getDatabase()).collection("tasks").findOne<any>({
    _id: new ObjectId(ctx.session!.taskId),
  });
  const updateResult = await (await getDatabase())
    .collection("tasks")
    .updateOne(
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
  await ctx.telegram.sendMessage(task.first, text, { parse_mode: "HTML" });
  await ctx.telegram.sendMessage(task.second, text, { parse_mode: "HTML" });
  await ctx.scene.leave();
  await createNewTask(ctx, task.first);
  await createNewTask(ctx, task.second);
}
