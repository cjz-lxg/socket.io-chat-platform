import axios from "axios";
import io from "socket.io-client";
import crypto from "crypto";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { md5, storeByBase64 } from "../util.js";

const serverUrl = "http://localhost:3000"; // 服务器地址
const symmetricKey = crypto.randomBytes(32);

async function connectSocket() {
  // 使用从登录请求获得的cookie来建立Socket连接,使用postman模拟时记得将每次的cookie删掉 ,否则都是重复利用一个sid
  const socket = io(serverUrl, {
    extraHeaders: {
      Cookie:
        "sid=s%3Aebyj3TXDe2VcPkiGOcthORgLTfPM-17g.RapFE1S6rBf7Zm39CPlQTrYhlXIh%2F1STvNfs3TQlX28", // 假设服务器返回了sessionId
    },
  });

  socket.on("connect", () => {
    console.log("Successfully connected to socket.io server");
    console.log("socketId:" + socket.id);
    // 发送事件到服务器
    socket.emit("publicKey:get");
  });

  socket.on("publicKey:get:response", (publicKey) => {
    // console.log("Received public key:", publicKey);
    // 使用公钥加密对称密钥
    const encryptedSymmetricKey = crypto.publicEncrypt(
      {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      Buffer.from(symmetricKey)
    );
    // console.log("generate AES KEY" + symmetricKey);
    // console.log(symmetricKey.length);

    // 将加密后的对称密钥转换为 Base64 格式，以便在网络上发送
    const encryptedSymmetricKeyBase64 =
      encryptedSymmetricKey.toString("base64");

    // 然后你可以发送加密后的对称密钥
    socket.emit(
      "symmetricKey:send",
      {
        symmetricKey: encryptedSymmetricKeyBase64,
      },
      (response) => {
        // console.log(response);

        // 创建一个随机的初始化向量
        const iv = randomBytes(16);

        // 创建一个加密器
        const cipher = createCipheriv("aes-256-cbc", symmetricKey, iv);

        // 加密一条消息
        const message = "Hello, world!";
        let encrypted = cipher.update(message, "utf8", "hex");
        encrypted += cipher.final("hex");

        const messageToSend = iv.toString("hex") + encrypted;

        socket.emit(
          "message:send",
          {
            content: messageToSend,
            channelId: "c6d6e34b-24cb-45ea-8c76-14f59462461f",
            signature: md5(messageToSend),
          },
          (response) => {
            // console.log(response);
          }
        );
      }
    );
  });

  socket.on("message:sent", (payload) => {
    // 验证签名
    if (md5(payload.message) !== payload.signature) {
      console.log("Invalid signature");
      return;
    }

    // 创建一个解密器
    const iv = Buffer.from(payload.message.slice(0, 32), "hex");
    const decipher = createDecipheriv("aes-256-cbc", symmetricKey, iv);
    console.log(socket.id + " " + storeByBase64(symmetricKey));
    // 解密消息
    const encryptedContent = payload.message.slice(32);
    let decrypted = decipher.update(encryptedContent, "hex", "utf8");
    decrypted += decipher.final("utf8");

    console.log("receive message:" + decrypted);
  });

  socket.on("disconnect", () => {
    console.log("Disconnected from socket.io server");
  });

  return socket;
}

const socket = await connectSocket();
