import { createClient } from "@supabase/supabase-js";
import { ask, password } from "./secure-input";
async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY)
    throw new Error("请安全配置后台环境变量");
  const client = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const operation = process.argv[2];
  if (operation === "create") {
    const email = await ask("家庭成员邮箱：");
    const name = await ask("显示昵称：");
    if ((await ask("确认该邮箱属于对应成员，输入 YES：")) !== "YES")
      throw new Error("已取消");
    const pwd = await password();
    if (pwd.length < 12) throw new Error("建议至少12位密码");
    const r = await client.auth.admin.createUser({
      email,
      password: pwd,
      email_confirm: true,
    });
    if (r.error) throw new Error("账号创建失败，请在控制台核对；没有发送邀请");
    const result = await client
      .from("profiles")
      .insert({ user_id: r.data.user.id, display_name: name, is_active: true });
    if (result.error)
      throw new Error(
        "账号已创建，名单录入失败，请用 activate 补录；不要重复新建",
      );
    console.log("账号已创建并加入名单；未发送邀请。");
  } else if (["activate", "disable", "reset-password"].includes(operation)) {
    const userID = await ask("账号UUID：");
    if (!/^[a-f0-9-]{36}$/.test(userID)) throw new Error("UUID不正确");
    if (operation === "reset-password") {
      const pwd = await password();
      if (pwd.length < 12) throw new Error("建议至少12位密码");
      const r = await client.auth.admin.updateUserById(userID, {
        password: pwd,
      });
      if (r.error) throw new Error("密码更新失败");
    } else {
      const r =
        operation === "activate"
          ? await client
              .from("profiles")
              .upsert({
                user_id: userID,
                display_name: await ask("昵称："),
                is_active: true,
              })
          : await client
              .from("profiles")
              .update({ is_active: false })
              .eq("user_id", userID);
      if (r.error) throw new Error("名单更新失败，请检查人数限制和账号UUID");
    }
    console.log("账号设置已更新。");
  } else
    throw new Error(
      "用法：npm run account -- create|activate|disable|reset-password",
    );
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
