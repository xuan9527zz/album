import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { ask, password } from "./secure-input";
async function main() {
  const env = process.env;
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY || !env.API_BASE_URL)
    throw new Error(
      "请配置SUPABASE_URL、SUPABASE_PUBLISHABLE_KEY、API_BASE_URL",
    );
  const photoID = await ask("照片UUID：");
  const filename = await ask("已导出的源文件绝对路径：");
  const email = await ask("本人的登录邮箱：");
  const pwd = await password();
  const auth = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const login = await auth.auth.signInWithPassword({ email, password: pwd });
  if (login.error || !login.data.session) throw new Error("登录失败");
  const headers = {
    Authorization: `Bearer ${login.data.session.access_token}`,
    "Content-Type": "application/json",
  };
  const sourceHash = createHash("sha256");
  for await (const chunk of createReadStream(filename))
    sourceHash.update(chunk);
  const r = await fetch(
    `${env.API_BASE_URL}/v1/photos/${photoID}/original-download`,
    { method: "POST", headers, body: "{}" },
  );
  if (!r.ok) throw new Error("无法取得本人原件");
  const link = (await r.json()) as any;
  const download = await fetch(link.url);
  if (!download.ok || !download.body) throw new Error("下载失败");
  const targetHash = createHash("sha256");
  for await (const chunk of download.body as any) targetHash.update(chunk);
  if (sourceHash.digest("hex") !== targetHash.digest("hex"))
    throw new Error("源文件与下载原件字节不一致");
  console.log(
    "SHA256一致：源文件 → 已保存原件 → 下载文件。未打印授权链接或照片信息。",
  );
  await auth.auth.signOut();
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
