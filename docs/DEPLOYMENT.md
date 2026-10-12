# 从零部署

独立 Supabase `album` 项目已执行 `202610120001_album.sql`，Cloudflare `family-album` 私有桶已设置 CORS；Worker 密钥、成员账号、Pages 尚未配置完成。以下步骤用于核对并继续部署，不复用其他网站的账号或数据库。不要把真实密钥提交到 Git 或聊天记录。

## 1. Supabase

项目 `nqjdngemhgmahqjuuxwx` 已在 SQL Editor 执行 `supabase/migrations/202610120001_album.sql`，**不要重复执行**。核对 `profiles`、`photos`、`photo_assets` 的 RLS 已开启，anon 无业务读取权限，`authenticated` 只有本人 SELECT，`album_action` 与 `album_maintenance` 仅 service role 可执行。以后用新增迁移升级。

Auth 设置中关闭公众邮箱注册和匿名登录；账号由管理员控制台或 `npm run account -- create` 建立四个。受控脚本要求交互确认邮箱属主，不发送邀请。Supabase 的前端 publishable key 可公开；后台 secret key 只能在 Worker secrets 和本地私密环境中。[Supabase Auth](https://supabase.com/docs/guides/auth)、[API keys](https://supabase.com/docs/guides/getting-started/api-keys)、[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)。

## 2. R2

现有 `family-album` 私有桶的 `r2.dev` 公开访问已关闭。给该桶创建仅限此桶、Object Read & Write 的 S3 API key。CORS 已按 `config/r2-cors.example.json` 设置：正式 origin 为 `https://xuan9527zz.github.io`，允许 GET、HEAD、PUT 与所需请求头。CORS 不是权限校验。给桶设置用量提醒；应用 8 GB 预算无法保证供应商账单绝对为零。[R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/)、[R2 价格](https://developers.cloudflare.com/r2/pricing/)。

## 3. Worker

`apps/api/wrangler.toml` 已设置正式前端 origin `https://xuan9527zz.github.io`，并列出必须存在的 Worker secrets：`SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY`、`SUPABASE_SECRET_KEY`、`R2_ACCOUNT_ID`、`R2_BUCKET_NAME`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`。本机的 `apps/api/.dev.vars` 已用公开值预填，另外三项密钥只由项目所有者在本机粘贴。不要通过聊天、命令行参数或 Git 提交密钥。可用 `npx wrangler deploy --config apps/api/wrangler.toml --secrets-file apps/api/.dev.vars` 一次上传完整配置；正式发布前先验证文件无占位值。此命令会部署 Worker，应在完成云端冒烟准备后执行。

先执行 `npm run build:api`；首次部署使用上一段带 `--secrets-file` 的命令，并记录真实 Worker URL。后续仅更新代码时可执行 `npm run deploy:api`，已有 secrets 会保留。`GET /health` 仅可用于服务存活检测。GitHub Actions 的 Worker 部署工作流是手动触发，需仓库 secret `CLOUDFLARE_API_TOKEN` 与变量 `CLOUDFLARE_ACCOUNT_ID`；Worker 的业务 secrets 仍需在 Cloudflare 安全设置中输入，不由工作流生成。

## 4. GitHub Pages

仓库 `xuan9527zz/album` 只放代码和合成测试素材。仓库 Settings → Pages 选择 **GitHub Actions**。配置仓库 Variables：`VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`、`VITE_API_BASE_URL`。手动触发 `Deploy Pages`；该工作流检查三项变量，按 `/album/` 构建并发布。预计静态 URL 为 `https://xuan9527zz.github.io/album/`，实际以 Pages 成功结果为准。不要将此预期地址当作已上线链接。

Supabase Auth 的允许站点/跳转地址填实际 Pages URL。Worker `ALLOWED_ORIGINS` 与 R2 CORS 填实际 origin。Pages 可公开静态源码，但业务记录与文件必须受后台权限保护。[GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)。

## 5. 真实验收和发布门槛

用本人测试账号交互运行 `npm run test:cloud`：它上传合成 PNG/HEIC，核对原件下载 SHA256、重放 PUT 的 412、篡改 MD5 拒绝、幂等完成；可额外输入第二成员测试真实跨账号隔离。测试素材自动标记删除，等已发 PUT 到期后运行 `npm run maintenance -- cleanup --apply`。不含第二成员时不得标记云端跨账号测试通过。

再用四部真实 iPhone 分别从“照片”和“文件”App 导入，核对 HEIC 原件、Live 图像及配套视频、下载文件名和 bytes、退出切换账号、主屏幕安装/更新。在中国大陆 Wi-Fi 和移动网络上记录设备、iOS、时间和首屏/大图/上传耗时。测试报告模板见 `docs/TEST_REPORT.md`。如果真实 R2 的条件写入或校验行为不符，先修正实现并重新测，再接纳家庭照片。

回滚：前端从 GitHub Pages 部署历史回退到已知提交；Worker 重新部署已知版本；数据库迁移使用新的修复迁移，不删除已应用迁移。部署版本和迁移顺序记录到交接文档。
