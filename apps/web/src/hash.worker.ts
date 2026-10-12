import { createMD5, createSHA256 } from "hash-wasm";
self.onmessage = async (event: MessageEvent<Blob>) => {
  try {
    const md5 = await createMD5();
    const sha = await createSHA256();
    md5.init();
    sha.init();
    for (let offset = 0; offset < event.data.size; offset += 1024 * 1024) {
      const chunk = new Uint8Array(
        await event.data.slice(offset, offset + 1024 * 1024).arrayBuffer(),
      );
      md5.update(chunk);
      sha.update(chunk);
    }
    const binary = md5.digest("binary");
    self.postMessage({
      md5: btoa(String.fromCharCode(...binary)),
      sha256: sha.digest("hex"),
    });
  } catch {
    self.postMessage({ error: "无法计算文件校验值" });
  }
};
