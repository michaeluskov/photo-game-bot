import { Db, MongoClient } from "mongodb";

let database: Db;

const client = new MongoClient(process.env.MONGO_URL || "");
let connectPromise: Promise<unknown>;

export async function getDatabase() {
  if (!connectPromise)
    connectPromise = client.connect();
  await connectPromise;
  database = client.db();
  return database;
}
