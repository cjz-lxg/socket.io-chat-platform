// 生成AES对称密钥
const symmetricKey = crypto.randomBytes(32);

// 在连接成功后，发送 'publicKey:get' 事件到服务器，以获取服务器的公钥
socket.emit('publicKey:get');

// 处理服务器返回的公钥
socket.on('publicKey:get:response', (publicKey) => {
    // 使用服务器的公钥对AES对称密钥进行加密
    const encryptedSymmetricKey = crypto.publicEncrypt({
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
    }, Buffer.from(symmetricKey));

    // 将加密后的AES对称密钥转换为Base64格式，以便在网络上发送
    const encryptedSymmetricKeyBase64 = encryptedSymmetricKey.toString('base64');

    // 发送加密后的AES对称密钥给服务器
    socket.emit('symmetricKey:send', {
        symmetricKey: encryptedSymmetricKeyBase64,
    }, (response) => {
        // 处理服务器的响应
    });
});