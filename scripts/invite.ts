import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2]?.trim().toLowerCase();
const name = process.argv[3]?.trim();
const redirectTo = process.env.ALBUM_PUBLIC_URL || "https://xuan9527zz.github.io/album/";

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY)
    throw new Error("请在本机私密环境配置 Supabase 管理密钥");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("用法：npm run invite -- 邮箱 昵称");
  if (!name || name.length > 40) throw new Error("昵称需为 1 至 40 个字符");
  if (new URL(redirectTo).protocol !== "https:")
    throw new Error("邀请跳转地址必须使用 HTTPS");

  const client = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const members = await client
    .from("profiles")
    .select("user_id", { count: "exact", head: true })
    .eq("is_active", true);
  if (members.error) throw new Error("无法核对成员人数");
  if ((members.count ?? 0) >= 4) throw new Error("四个成员名额已满");
  const users = await client.auth.admin.listUsers({ page: 1, perPage: 100 });
  if (users.error) throw new Error("无法核对现有账号");
  if (users.data.users.some((user) => user.email?.toLowerCase() === email))
    throw new Error("该邮箱已有账号，请先核对，不要重复邀请");

  const invite = await client.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo, data: { display_name: name } },
  });
  if (invite.error) throw new Error(`邀请链接生成失败：${invite.error.message}`);
  const profile = await client.from("profiles").insert({
    user_id: invite.data.user.id,
    display_name: name,
    is_active: true,
  });
  if (profile.error)
    throw new Error("邀请账号已生成，但成员资料写入失败；请先补录资料，不要重复邀请");

  const directory = join(".local", "invites");
  await mkdir(directory, { recursive: true });
  const filename = join(directory, `${randomUUID()}.txt`);
  await writeFile(filename, `${invite.data.properties.action_link}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  console.log(`邀请账号和成员资料已创建。一次性链接仅保存在 ${filename}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "邀请失败");
  process.exitCode = 1;
});
