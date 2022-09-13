import { getDatabase } from "./src/database";

exports.handler = async (event: any, context: any) => {
  context.callbackWaitsForEmptyEventLoop = false;
  console.log(event);
  const skip = Number(event.queryStringParameters?.skip) || 0;
  const take = Number(event.queryStringParameters?.take) || 10;
  const database = await getDatabase();
  const tasks = await database
    .collection("tasks")
    .aggregate([
      { $match: { done: 1 } },
      {
        $lookup: {
          from: "users",
          localField: "first",
          foreignField: "telegram_id",
          as: "first_users",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "second",
          foreignField: "telegram_id",
          as: "second_users",
        },
      },
      {
        $replaceWith: {
          $mergeObjects: [
            "$$ROOT",
            {
              first_name: {
                $getField: {
                  input: { $arrayElemAt: ["$first_users", 0] },
                  field: "name",
                },
              },
              second_name: {
                $getField: {
                  input: { $arrayElemAt: ["$second_users", 0] },
                  field: "name",
                },
              },
            },
          ],
        },
      },
      {
        $project: {
          task_name: 1,
          photo_url: 1,
          first_name: 1,
          second_name: 1,
          done_datetime: 1,
        },
      },
    ])
    .sort({ done_datetime: -1 })
    .skip(skip)
    .limit(take)
    .toArray();
  let response = {
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(tasks),
  };
  console.log("response: " + JSON.stringify(response));
  return response;
};
