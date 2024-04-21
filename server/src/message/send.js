import { ajv, channelRoom, loadByBase64, md5, redis } from "../util.js";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const validate = ajv.compile({
  type: "object",
  properties: {
    content: { type: "string", minLength: 1, maxLength: 5000 },
    channelId: { type: "string", format: "uuid" },
    signature: { type: "string", minLength: 0, maxLength: 32 },
  },
  required: ["content", "channelId", "signature"],
  additionalProperties: false,
});

export function sendMessage({ io, socket, db }) {
  return async (payload, callback) => {
    if (typeof callback !== "function") {
      return;
    }

    if (!validate(payload)) {
      return callback({
        status: "ERROR",
        errors: validate.errors,
      });
    }

    const contentAfterHash = md5(payload.content);

    if (contentAfterHash !== payload.signature) {
      return callback({
        status: "ERROR",
        errors: "Signature is not correct",
      });
    }

    const symmetricKey = loadByBase64(await redis.get(socket.id));

    // 创建一个解密器
    const iv = Buffer.from(payload.content.slice(0, 32), "hex");
    const decipher = createDecipheriv("aes-256-cbc", symmetricKey, iv);

    // 解密消息
    const encryptedContent = payload.content.slice(32);
    let decrypted = decipher.update(encryptedContent, "hex", "utf8");
    decrypted += decipher.final("utf8");

    const message = {
      from: socket.userId,
      channelId: payload.channelId,
      content: decrypted,
    };

    try {
      message.id = await db.insertMessage(message);
    } catch (_) {
      return callback({
        status: "ERROR",
      });
    }

    console.log(socket.id + "发送消息");
    const sockets = await io.in(channelRoom(message.channelId)).allSockets();
    await Promise.all(
      [...sockets].map(async (socketId) => {
        if (socket.id == socketId) return;
        const symmetricKeyFromRedis = await redis.get(socketId);
        if (!symmetricKeyFromRedis) return;

        const symmetricKey = loadByBase64(symmetricKeyFromRedis);

        // 创建一个随机的初始化向量
        const iv = randomBytes(16);

        // 创建一个加密器
        const cipher = createCipheriv("aes-256-cbc", symmetricKey, iv);

        // 加密一条消息
        const message = "Hello, world!";
        let encrypted = cipher.update(message, "utf8", "hex");
        encrypted += cipher.final("hex");

        const messageToSend = iv.toString("hex") + encrypted;
        console.log(
          socket.id +
            "-------------->" +
            socketId +
            " " +
            "发送消息:" +
            messageToSend +
            "/n 密钥:" +
            symmetricKeyFromRedis
        );
        io.to(socketId).emit("message:sent", messageToSend);
      })
    );

    callback({
      status: "OK",
      data: {
        id: message.id,
      },
    });
  };
}
