import { ajv, channelRoom, md5 } from "../util.js";

const validate = ajv.compile({
  type: "object",
  properties: {
    content: { type: "string", minLength: 1, maxLength: 5000 },
    channelId: { type: "string", format: "uuid" },
    signature: { type: "string", minLength: 32, maxLength: 32 },
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

    const message = {
      from: socket.userId,
      channelId: payload.channelId,
      content: payload.content,
    };

    try {
      message.id = await db.insertMessage(message);
    } catch (_) {
      return callback({
        status: "ERROR",
      });
    }

    socket.broadcast
      .to(channelRoom(message.channelId))
      .emit("message:sent", message);

    callback({
      status: "OK",
      data: {
        id: message.id,
      },
    });
  };
}
