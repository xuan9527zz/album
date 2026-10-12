import { productionDependencies, type Env } from "../apps/api/src/index";
import { mkdir, open, rm } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
async function main() {
  const env = process.env as unknown as Env;
  if (!env.SUPABASE_SECRET_KEY || !env.R2_SECRET_ACCESS_KEY)
    throw new Error("缺少私密备份配置");
  const d = productionDependencies(env);
  const inventory = await d.db.call("album_maintenance", {
    p_action: "inventory",
    p_data: {},
  });
  const root = resolve(".local/backups", `objects-${Date.now()}`);
  await mkdir(root, { recursive: true });
  let count = 0,
    bytes = 0;
  for (const asset of inventory.assets as {
    key: string;
    bytes: number;
    sha256: string;
  }[]) {
    if (!/^private\/[0-9a-f-]+\/[0-9a-f-]+\/[0-9a-f-]+$/.test(asset.key))
      throw new Error("检测到非预期对象路径；备份停止");
    const target = resolve(root, asset.key);
    if (!target.startsWith(root + sep)) throw new Error("备份目标超出目录");
    await mkdir(resolve(target, ".."), { recursive: true });
    const file = await open(target, "wx");
    const hash = createHash("sha256");
    let length = 0;
    try {
      for await (const chunk of Readable.fromWeb(
        (await d.store.stream(asset.key)) as any,
      )) {
        const buffer = Buffer.from(chunk);
        length += buffer.length;
        hash.update(buffer);
        let offset = 0;
        while (offset < buffer.length) {
          offset += (await file.write(buffer, offset, buffer.length - offset))
            .bytesWritten;
        }
      }
    } catch {
      await file.close();
      await rm(target, { force: true });
      throw new Error("对象下载失败；备份未完成");
    }
    await file.close();
    if (length !== asset.bytes) {
      await rm(target, { force: true });
      throw new Error("备份字节数与记录不一致");
    }
    const digest = hash.digest("hex");
    if (digest !== asset.sha256) {
      await rm(target, { force: true });
      throw new Error("备份SHA256与批准的源文件不一致");
    }
    count++;
    bytes += length;
    // Hash result stays local in a private manifest, never printed with keys.
    await import("node:fs/promises").then((fs) =>
      fs.appendFile(
        resolve(root, "checksums.jsonl"),
        JSON.stringify({ key: asset.key, sha256: digest, bytes: length }) +
          "\n",
      ),
    );
  }
  console.log(
    `对象备份完成：${count} 个文件，${bytes} 字节。路径在忽略的 .local/backups 下；请加密复制到独立介质。`,
  );
}
main().catch(() => {
  console.error("对象备份未完成，请检查存储访问并重新运行。");
  process.exit(1);
});
