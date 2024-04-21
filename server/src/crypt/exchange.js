import { generateRSAKeyPair, redis } from "../util";

function sendPublicKey({ io, socket, db }) {
  return async (payload, callback) => {
    if (typeof callback !== "function") {
      return;
    }

    const key_pair = generateRSAKeyPair();

    redis.set(key_pair.publicKey, key_pair.privateKey);

    socket.emit("publicKey:get:response", key_pair.publicKey);

    callback({
      status: "OK",
      data: key_pair.publicKey,
    });
  };
}

function receiveSymmetricKey({ io, socket, db }) {
  return async (payload, callback) => {
    if (typeof callback !== "function") {
      return;
    }

    const cryptKey = payload.symmetricKey;

    const privateKey = redis.get(key_pair.publicKey);

    //基于私钥解密
    const symmetricKey = crypto.privateDecrypt(
      {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      Buffer.from(cryptKey, "base64")
    );

    redis.set(socket.userId, symmetricKey);

    callback({
      status: "OK",
    });
  };
}

export default {
  sendPublicKey,
  receiveSymmetricKey,
};
