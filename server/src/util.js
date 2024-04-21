import { createLogger } from "winston";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import Redis from "ioredis";

import { generateKeyPairSync } from "crypto";

import { createHash } from "crypto";


export function storeByBase64(content) {
  return Buffer.from(content).toString("base64");
}

export function loadByBase64(content) {
  return Buffer.from(content, "base64");
}

export function md5(data) {
  return createHash("md5").update(data).digest("hex");
}

export const redis = new Redis();

export function generateRSAKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048, // the length of your key in bits
    publicKeyEncoding: {
      type: "spki", // recommended to be 'spki' by the Node.js docs
      format: "pem", // 'pem' is the default format
    },
    privateKeyEncoding: {
      type: "pkcs8", // recommended to be 'pkcs8' by the Node.js docs
      format: "pem", // 'pem' is the default format
    },
  });

  return { publicKey, privateKey };
}

export const logger = createLogger({
  level: "info",
});

const ajv = new Ajv({
  useDefaults: true,
});

addFormats(ajv);

export { ajv };

export async function doInTransaction(pool, query) {
  const client = await pool.connect();
  let output;

  try {
    await client.query("BEGIN");

    output = await query(client);

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  return output;
}

export function channelRoom(channelId) {
  return `channel:${channelId}`;
}

export function userRoom(userId) {
  return `user:${userId}`;
}

export function sessionRoom(sessionId) {
  return `session:${sessionId}`;
}

export function userStateRoom(userId) {
  return `user_state:${userId}`;
}
