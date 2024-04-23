import { Scope } from "ajv/dist/compile/codegen/scope.js";
import {
  generateRSAKeyPair,
  loadByBase64,
  redis,
  storeByBase64,
} from "../util.js";
import crypto from "crypto";

export function sendPublicKey({ io, socket, db }) {
  return async () => {
    const key_pair = generateRSAKeyPair();

    redis.set(socket.userId, key_pair.privateKey);

    socket.emit("publicKey:get:response", key_pair.publicKey);
  };
}

export function receiveSymmetricKey({ io, socket, db }) {
  return async (payload, callback) => {
    if (typeof callback !== "function") {
      return;
    }

    const cryptKey = payload.symmetricKey;

    const privateKey = await redis.get(socket.userId);

    //基于私钥解密
    const symmetricKey = crypto.privateDecrypt(
      {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      Buffer.from(cryptKey, "base64")
    );

    const symmetricKeyBase64 = storeByBase64(symmetricKey);
    // await redis.set(socket.userId, symmetricKeyBase64);
    await redis.set(socket.id, symmetricKeyBase64);
    const load = loadByBase64(symmetricKeyBase64);
    console.log("---------->" + load.length);

    callback({
      status: "OK",
    });
  };
}
