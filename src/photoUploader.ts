import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import fetch from 'node-fetch';

const AWS_ACCESS_KEY = process.env["AWS_ACCESS_KEY"] || "";
const AWS_SECRET_KEY = process.env["AWS_SECRET_KEY"] || "";
const BUCKET_NAME = "kewebrocks";

const s3Client = new S3Client({
  region: "eu-central-1",
  credentials: {
    accessKeyId: AWS_ACCESS_KEY,
    secretAccessKey: AWS_SECRET_KEY,
  },
}); 

export async function loadStream(url: string): Promise<Buffer> {
  const response = await fetch(url);
  return response.buffer();
}

export async function uploadPhoto(fileName: string, content: Buffer) {
  const sentCommand = await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: "photos/" + fileName,
      Body: content,
    })
  );
  return "https://kewebrocks.s3.eu-central-1.amazonaws.com/photos/" + fileName;
}
