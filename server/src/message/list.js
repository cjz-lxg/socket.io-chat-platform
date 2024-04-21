import { ajv } from "../util.js";
import { loadByBase64 } from "../util.js";
import { redis } from "../util.js";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const validate = ajv.compile({
  type: "object",
  properties: {
    channelId: { type: "string", format: "uuid" },
    after: { type: "string" },
    size: { type: "integer", minimum: 1, maximum: 100, default: 10 },
    orderBy: { type: "string", enum: ["id:asc", "id:desc"], default: "id:asc" },
  },
  required: [],
  additionalProperties: false,
});

export function listMessages({ socket, db }) {
  return async (query, callback) => {
    if (typeof callback !== "function") {
      return;
    }

    console.log(query);

    if (!validate(query)) {
      return callback({
        status: "ERROR",
        errors: validate.errors,
      });
    }

    if (!(await db.isUserInChannel(socket.userId, query.channelId))) {
      return callback({
        status: "ERROR",
      });
    }

    let { data, hasMore } = await db.listMessages(query);

    // console.log("ori data", data);

    // 为data的content进行加密
    data = await Promise.all(
      data.map(async (message) => {
        const symmetricKeyBase64 =
          (await redis.get(socket.id)) ||
          "VxEnWBDxMzPGLL0T4Z1B331uCk232vF37ic01g0Hx3E=";
        const symmetricKey = loadByBase64(symmetricKeyBase64);
        // console.log("symmetricKey", symmetricKey);

        // 创建一个随机的初始化向量
        const iv = randomBytes(16);

        // 创建一个加密器
        const cipher = createCipheriv("aes-256-cbc", symmetricKey, iv);

        // 加密消息
        let encrypted = cipher.update(message.content, "utf8", "hex");
        encrypted += cipher.final("hex");

        return {
          ...message,
          content: iv.toString("hex") + encrypted,
        };
      })
    );

    // console.log("trans data", data);

    callback({
      status: "OK",
      data,
      hasMore,
    });
  };
}
