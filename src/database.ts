import { Db, MongoClient } from "mongodb";

let database: Db;

const client = new MongoClient(process.env.MONGO_URL || "");
let connectPromise: Promise<unknown>;

export async function getDatabase() {
  if (!connectPromise) connectPromise = client.connect();
  await connectPromise;
  database = client.db();
  return database;
}

export async function getUsersWithMinimumTaskCount(telegram_id: number) {
  const db = await getDatabase();
  const users = await db
    .collection("users")
    .aggregate<any>([
      { $match: { is_absent: false, name: {$ne: null}, telegram_id: { $ne: telegram_id } } },
      {
        $lookup: {
          from: "tasks",
          localField: "telegram_id",
          foreignField: "first",
          as: "first_tasks",
        },
      },
      {
        $lookup: {
          from: "tasks",
          localField: "telegram_id",
          foreignField: "second",
          as: "second_tasks",
        },
      },
      {
        $replaceWith: {
          $mergeObjects: [
            "$$ROOT",
            {
              first_tasks: {
                $filter: {
                  input: "$first_tasks",
                  as: "t",
                  cond: {
                    $ne: ["$$t.done", 1],
                  },
                },
              },
              second_tasks: {
                $filter: {
                  input: "$second_tasks",
                  as: "t",
                  cond: {
                    $ne: ["$$t.done", 1],
                  },
                },
              },
            },
          ],
        },
      },
      {
        $replaceWith: {
          $mergeObjects: [
            "$$ROOT",
            {
              tasks_sum: {
                $sum: [
                  {
                    $size: "$first_tasks",
                  },
                  {
                    $size: "$second_tasks",
                  },
                ],
              },
            },
          ],
        },
      },
      {
        $project: {
          telegram_id: true,
          tasks_sum: true,
        },
      },
      {
        $group: {
          _id: "$tasks_sum",
          telegram_id: {
            $addToSet: "$telegram_id",
          },
        },
      },
      {
        $sort: {
          _id: 1,
        },
      },
      {
        $limit: 1,
      },
    ])
    .toArray();
  return users[0];
}
