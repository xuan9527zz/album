# 从零部署

当前没有 Supabase、R2 或 Worker 生产配置。按下列顺序使用 **独立的相册项目** 操作，不复用其他网站的账号或数据库。命令中的值都是示例，不要把真实密钥提交到 Git 或聊天记录。

## 1. Supabase

建立独立项目。进入 SQL Editor，执行 `supabase/migrations/202610120001_album.sql`，核对 `profiles`、`photos`、`photo_assets` 的 RLS 已开启，anon 无业务读取权限，`authenticated` 只有本人 SELECT，`album_action` 与 `album_maintenance` 仅 service role 可执行。执行过的迁移不要再修改；以后用新增迁移升级。

Auth 设置中关闭公众邮箱注册和匿名登录；账号由管理员控制台或 `npm run account -- create` 建立四个。受控脚本要求交互确认邮箱属主，不发送邀请。Supabase 的前端 publishable key 可公开；后台 secret key 只能在 Worker secrets 和本地私密环境中。[Supabase Auth](https://supabase.com/docs/guides/auth)、[API keys](https://supabase.com/docs/guides/getting-started/api-keys)、[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)。

## 2. R2

新建 `family-album-private` 私有桶，保持 `r2.dev` 公开访问和公共自定义域名关闭。给相册桶创建最小权限 S3 API key。配置 CORS，可参考 `config/r2-cors.example.json`：正式 origin 为 `https://xuan9527zz.github.io`，允许 GET、HEAD、PUT 与所需请求头。CORS 不是权限校验。给桶设置用量提醒；应用 8 GB 预算无法保证供应商账单绝对为零。[R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/)、[R2 价格](https://developers.cloudflare.com/r2/pricing/)。

## 3. Worker

在 `apps/api/wrangler.toml` 将 `ALLOWED_ORIGINS` 换为实际前端 origin（部署生产时删除 localhost）。需要的 Worker secrets 列在 `apps/api/.dev.vars.example`：`SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY`、`SUPABASE_SECRET_KEY`、`R2_ACCOUNT_ID`、`R2_BUCKET_NAME`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`。在 Cloudflare 环境中逐项运行 `npx wrangler secret put NAME --config apps/api/wrangler.toml` 并按提示输入，不通过命令行参数暴露值。开发时将示例文件复制为 Git 忽略的 `apps/api/.dev.vars`，只保留本机。

执行 `npm run build:api` 和 `npm run deploy:api`，记录真实 Worker URL。`GET /health` 仅可用于服务存活检测。GitHub Actions 的 Worker 部署工作流是手动触发，需仓库 secret `CLOUDFLARE_API_TOKEN` 与变量 `CLOUDFLARE_ACCOUNT_ID`；Worker 的业务 secrets 仍需在 Cloudflare 安全设置中输入，不由工作流生成。

## 4. GitHub Pages

仓库 `xuan9527zz/album` 只放代码和合成测试素材。仓库 Settings → Pages 选择 **GitHub Actions**。配置仓库 Variables：`VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`、`VITE_API_BASE_URL`。手动触发 `Deploy Pages`；该工作流检查三项变量，按 `/album/` 构建并发布。预计静态 URL 为 `https://xuan9527zz.github.io/album/`，实际以 Pages 成功结果为准。不要将此预期地址当作已上线链接。

Supabase Auth 的允许站点/跳转地址填实际 Pages URL。Worker `ALLOWED_ORIGINS` 与 R2 CORS 填实际 origin。Pages 可公开静态源码，但业务记录与文件必须受后台权限保护。[GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)。

## 5. 真实验收和发布门槛

用本人测试账号交互运行 `npm run test:cloud`：它上传合成 PNG/HEIC，核对原件下载 SHA256、重放 PUT 的 412、篡改 MD5 拒绝、幂等完成；可额外输入第二成员测试真实跨账号隔离。测试素材自动标记删除，等已发 PUT 到期后运行 `npm run maintenance -- cleanup --apply`。不含第二成员时不得标记云端跨账号测试通过。

再用四部真实 iPhone 分别从“照片”和“文件”App 导入，核对 HEIC 原件、Live 图像及配套视频、下载文件名和 bytes、退出切换账号、主屏幕安装/更新。在中国大陆 Wi-Fi 和移动网络上记录设备、iOS、时间和首屏/大图/上传耗时。测试报告模板见 `docs/TEST_REPORT.md`。如果真实 R2 的条件写入或校验行为不符，先修正实现并重新测，再接纳家庭照片。

回滚：前端从 GitHub Pages 部署历史回退到已知提交；Worker 重新部署已知版本；数据库迁移使用新的修复迁移，不删除已应用迁移。部署版本和迁移顺序记录到交接文档。
