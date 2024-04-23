import io from "socket.io-client";

async function connectSocket() {
    // 使用从登录请求获得的cookie来建立Socket连接,使用postman模拟时记得将每次的cookie删掉 ,否则都是重复利用一个sid
    const socket = io(serverUrl, {
        extraHeaders: {
            Cookie:
                "sid=s%3Aebyj3TXDe2VcPkiGOcthORgLTfPM-17g.RapFE1S6rBf7Zm39CPlQTrYhlXIh%2F1STvNfs3TQlX28", // 假设服务器返回了sessionId
        },
    })
}

// 
socket.on("connect", () => {
    console.log(
        "Successfully connected to socket.io server " + "socketId:" + socket.id
    );
    // 发送事件到服务器
    socket.emit("publicKey:get");
});

export default socket