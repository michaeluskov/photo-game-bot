import { getDatabase } from "./src/database";

exports.handler = async (event: any) => {
  console.log(event);
  const skip = event.queryStringParameters?.skip || 0;
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
      "x-custom-header": "my custom header value",
    },
    body: JSON.stringify(tasks),
  };
  console.log("response: " + JSON.stringify(response));
  return response;
};
