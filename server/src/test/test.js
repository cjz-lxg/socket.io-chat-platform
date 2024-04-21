import axios from "axios";
import io from "socket.io-client";
import crypto from "crypto";

const serverUrl = "http://localhost:3000"; // 服务器地址

async function login(username, password) {
  try {
    const response = await axios.post(
      `${serverUrl}/login`,
      {
        username,
        password,
      },
      { withCredentials: true }
    ); // 确保发送cookie

    return response.data;
  } catch (error) {
    console.error("Login failed:", error);
    return null;
  }
}

async function connectSocket() {
  const data = await login("mysql", "mysql");

  if (data) {
    // 使用从登录请求获得的cookie来建立Socket连接
    const socket = io(serverUrl, {
      extraHeaders: {
        Cookie:
          "sid=s%3ANPHYglCp1Iac9FQTwEsTSVOVKiszI9Le.EMXvSzcIJZhbwp3x%2FYnIywZ8hBV57i986ANxvN3FzGA", // 假设服务器返回了sessionId
      },
    });

    socket.on("connect", () => {
      console.log("Successfully connected to socket.io server");
      // 发送事件到服务器
      socket.emit("publicKey:get");
    });

    socket.on("publicKey:get:response", (publicKey) => {
      const symmetricKey = "symmetricKey";

      // 使用公钥加密对称密钥
      const encryptedSymmetricKey = crypto.publicEncrypt(
        {
          key: publicKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: "sha256",
        },
        Buffer.from(symmetricKey)
      );

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
          console.log("Received response:", response);
        }
      );
    });

    socket.on("disconnect", () => {
      console.log("Disconnected from socket.io server");
    });

    // 监听服务器发来的事件
    socket.on("message", (msg) => {
      console.log("New message:", msg);
    });

    return socket;
  } else {
    console.error("Failed to log in and establish socket connection.");
  }
}

connectSocket();
