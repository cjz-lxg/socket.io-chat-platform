import { acceptHMRUpdate, defineStore } from "pinia";
import { socket } from "@/BackendService";
import forge from "node-forge";
import { md5 } from "../util";

const symmetricKey = forge.random.getBytesSync(32);

function insertAtRightOffset(messages, message) {
  // note: this won't work with id bigger than Number.MAX_SAFE_INTEGER
  message.mid = message.id ? parseInt(message.id, 10) : Infinity;

  for (let i = 0; i < messages.length; i++) {
    if (messages[i].id === message.id) {
      return false;
    }
    if (messages[i].mid > message.mid) {
      messages.splice(i, 0, message);
      return true;
    }
  }

  messages.push(message);
  return true;
}

export const useMainStore = defineStore("main", {
  state: () => ({
    isInitialized: false,
    currentUser: {},
    channels: new Map(),
    users: new Map(),
    pendingUsers: new Map(),
    selectedChannelId: undefined,
    showJoinOrCreateChannelModel: false,
    showSearchUserModal: false,
  }),

  actions: {
    bindEvents() {
      if (process.env.NODE_ENV !== "production") {
        socket.onAny((...args) => {
          console.log("incoming", args);
        });

        socket.onAnyOutgoing((...args) => {
          console.log("outgoing", args);
        });
      }

      socket.on("connect", async () => {
        if (this.isInitialized) {
          const res = await socket.emitWithAck("channel:list", {
            size: 100,
          });

          if (res.status === "OK") {
            res.data.forEach((channel) => this.addChannel(channel));
          }

          await this.loadMessagesForSelectedChannel("forward");
        }
      });

      socket.on("channel:created", (channel) => this.addChannel(channel));
      socket.on("channel:joined", (channel) => this.addChannel(channel));

      // 使用公钥加密私钥
      socket.on("publicKey:get:response", (publicKey) => {
        console.log("---------->" + publicKey);
        publicKey = forge.pki.publicKeyFromPem(publicKey);

        const encryptedSymmetricKey = publicKey.encrypt(
          symmetricKey,
          "RSA-OAEP",
          {
            md: forge.md.sha256.create(), // 指定使用SHA-256作为 OAEP 的散列函数
          }
        );

        // 将加密后的对称密钥转换为 Base64 格式，以便在网络上发送
        const encryptedSymmetricKeyBase64 = forge.util.encode64(
          encryptedSymmetricKey
        );

        // 然后你可以发送加密后的对称密钥
        if (socket.connected) {
          socket.emit(
            "symmetricKey:send",
            { symmetricKey: encryptedSymmetricKeyBase64 },
            (response) => {
              console.log("对称密钥已经发送成功");
            }
          );
        } else {
          console.error("Socket not connected.");
        }
      });

      socket.on("message:sent", (message) => {
        this.addMessage(message, true);
        location.reload();
      });

      socket.on("user:connected", (userId) => {
        if (this.users.has(userId)) {
          this.users.get(userId).isOnline = true;
        }
      });

      socket.on("user:disconnected", (userId) => {
        if (this.users.has(userId)) {
          this.users.get(userId).isOnline = false;
        }
      });

      socket.on("message:typing", async ({ channelId, userId, isTyping }) => {
        const channel = this.channels.get(channelId);

        if (!channel) {
          return;
        }

        if (isTyping) {
          const user = await this.getUser(userId);

          if (!user) {
            return;
          }

          channel.typingUsers.set(userId, user);
        } else {
          channel.typingUsers.delete(userId);
        }
      });
    },

    async init() {
      socket.connect();

      console.log(
        "Successfully connected to socket.io server " + "socketId:" + socket.id
      );
      // 发送事件到服务器
      await socket.emit("publicKey:get");

      const res = await socket.emitWithAck("channel:list", {
        size: 100,
      });

      res.data.forEach((channel) => this.addChannel(channel));

      await this.loadMessagesForSelectedChannel();

      this.isInitialized = true;

      return this.publicChannels[0].id;
    },

    clear() {
      this.isInitialized = false;
      this.currentUser = {};
      this.channels.clear();
      this.users.clear();
      this.selectedChannelId = undefined;
    },

    setCurrentUser(user) {
      this.currentUser = user;
    },

    addChannel(channel) {
      if (this.channels.has(channel.id)) {
        const existingChannel = this.channels.get(channel.id);

        Object.keys(channel).forEach((key) => {
          existingChannel[key] = channel[key];
        });

        existingChannel.isLoaded = false;
        existingChannel.typingUsers.clear();
      } else {
        channel.messageInput = "";
        channel.messages = [];
        channel.hasMore = false;
        channel.isLoaded = false;
        channel.typingUsers = new Map();

        this.channels.set(channel.id, channel);
      }
    },

    async selectChannel(channelId) {
      this.selectedChannelId = channelId;

      await this.loadMessagesForSelectedChannel();
      await this.ackLastMessageIfNecessary();
    },

    async loadMessagesForSelectedChannel(order = "backward", force = false) {
      const channel = this.selectedChannel;

      if (!channel || (channel.isLoaded && !force)) {
        return;
      }

      const query = {
        size: 20,
        channelId: this.selectedChannelId,
      };

      if (order === "backward") {
        query.orderBy = "id:desc";
        if (channel.messages.length) {
          query.after = channel.messages[0].id;
        }
      } else {
        query.orderBy = "id:asc";
        if (channel.messages.length) {
          query.after = channel.messages[channel.messages.length - 1].id;
        }
      }

      const res = await socket.emitWithAck("message:list", query);

      if (res.status !== "OK") {
        return;
      }
      // 验证签名
      if (md5(JSON.stringify(res.data)) !== res.signature) {
        console.log("Invalid signature");
        return;
      }
      //解密消息

      res.data.forEach((message) => {
        // console.log(message);

        // 创建一个随机的初始化向量
        const iv = forge.util.hexToBytes(message.content.slice(0, 32));
        // 创建一个解密器
        const decipher = forge.cipher.createDecipher("AES-CBC", symmetricKey);
        decipher.start({ iv: iv });

        // 解密消息
        const encryptedContent = message.content.slice(32);
        decipher.update(
          forge.util.createBuffer(forge.util.hexToBytes(encryptedContent))
        );

        const result = decipher.finish(); // 检查解密是否成功

        if (result) {
          // 输出解密后的文本
          let decrypt = decipher.output.toString("utf8");
          message.content = decrypt;
          this.addMessage(message);
        } else {
          throw new Error("Failed to decrypt data.");
        }
      });

      if (order === "forward" && res.hasMore) {
        return this.loadMessagesForSelectedChannel("forward");
      }

      channel.isLoaded = true;
      channel.hasMore = res.hasMore;

      await this.ackLastMessageIfNecessary();
    },

    addMessage(message, countAsUnread = false) {
      const channel = this.channels.get(message.channelId);

      if (!channel) {
        return;
      }

      const inserted = insertAtRightOffset(channel.messages, message);

      if (inserted && countAsUnread && message.from !== this.currentUser.id) {
        channel.unreadCount++;
        this.ackLastMessageIfNecessary();
      }
    },

    async ackLastMessageIfNecessary() {
      if (this.selectedChannel?.unreadCount > 0) {
        await socket.emitWithAck("message:ack", {
          channelId: this.selectedChannel.id,
          messageId: this.selectedChannel.messages.at(-1).id,
        });

        this.selectedChannel.unreadCount = 0;
      }
    },

    async sendMessage(content) {
      const message = {
        id: undefined,
        from: this.currentUser.id,
        channelId: this.selectedChannelId,
        content,
      };
      console.log("发送的消息:" + content);

      this.addMessage(message);
      // 创建一个随机的初始化向量
      const iv = forge.random.getBytesSync(16);

      // 创建一个加密器
      // const symmetricKey = window.sessionStorage.getItem("symmetricKey");
      const cipher = forge.cipher.createCipher("AES-CBC", symmetricKey);

      // 加密一条消息
      cipher.start({ iv: iv });
      cipher.update(forge.util.createBuffer(forge.util.encodeUtf8(content)));
      cipher.finish();

      // 获取加密后的数据并转换为十六进制字符串
      const encrypted = cipher.output.toHex();

      // 将初始化向量和加密后的数据合并，转换为十六进制字符串
      const contentToSend = forge.util.bytesToHex(iv) + encrypted;

      const payload = {
        channelId: this.selectedChannelId,
        content: contentToSend,
        signature: md5(contentToSend),
      };

      const res = await socket.emitWithAck("message:send", payload);

      if (res.status === "OK") {
        message.id = res.data.id;
        message.mid = parseInt(message.id, 10);
      }
    },

    async getUser(userId) {
      if (this.currentUser?.id === userId) {
        return this.currentUser;
      }

      if (this.users.has(userId)) {
        return this.users.get(userId);
      }

      // only load a given user once
      if (this.pendingUsers.has(userId)) {
        return this.pendingUsers.get(userId);
      }

      const promise = socket
        .emitWithAck("user:get", { userId })
        .then((res) => {
          if (res.status === "OK") {
            const user = res.data;

            this.users.set(userId, res.data);
            return user;
          }
        })
        .finally(() => {
          this.pendingUsers.delete(userId);
        });

      this.pendingUsers.set(userId, promise);

      return promise;
    },
  },

  getters: {
    publicChannels() {
      const publicChannels = [];

      this.channels.forEach((channel) => {
        if (channel.type === "public") {
          publicChannels.push(channel);
        }
      });

      publicChannels.sort((a, b) => {
        // always put the 'General' channel first
        if (a.name === "General") {
          return -1;
        } else if (b.name === "General") {
          return 1;
        }
        return b.name < a.name ? 1 : -1;
      });

      return publicChannels;
    },

    privateChannels() {
      const privateChannels = [];

      this.channels.forEach((channel) => {
        if (channel.type === "private") {
          privateChannels.push(channel);
        }
      });

      return privateChannels;
    },

    selectedChannel() {
      return this.channels.get(this.selectedChannelId);
    },

    isChannelSelected() {
      return (channelId) => {
        return this.selectedChannelId === channelId;
      };
    },

    messages() {
      return this.selectedChannel?.messages || [];
    },
  },
});

// reference: https://pinia.vuejs.org/cookbook/hot-module-replacement.html
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useMainStore, import.meta.hot));
}
