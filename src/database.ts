import { Db, MongoClient } from "mongodb";

export let database: Db;

export async function getDatabase() {
  if (database)
    return database;
  const client = new MongoClient(process.env.MONGO_URL || "");
  await client.connect();
  database = client.db();
  return database;
}
