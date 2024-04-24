import forge from "node-forge";

export function sleep(delay) {
  return new Promise((resolve) => setTimeout(resolve, delay));
}

export function md5(data) {
  // 创建一个MD5的消息摘要
  const md = forge.md.md5.create();
  // 提供数据到消息摘要
  md.update(data);
  // 获取十六进制格式的摘要
  return md.digest().toHex();
}

export function debounce(fn, delay) {
  let timeoutID = null;
  return () => {
    clearTimeout(timeoutID);
    const args = arguments;
    timeoutID = setTimeout(() => {
      fn.apply(this, args);
    }, delay);
  };
}
