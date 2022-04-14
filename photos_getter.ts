import { getDatabase } from "./src/database";

exports.handler = async (event: any, context: any) => {
  context.callbackWaitsForEmptyEventLoop = false;
  console.log(event);
  const skip = Number(event.queryStringParameters?.skip) || 0;
  const database = await getDatabase();
  const tasks = await database
    .collection("tasks")
    .find({
      done: 1,
    })
    .sort({ done_datetime: -1 })
    .skip(skip)
    .limit(10)
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
