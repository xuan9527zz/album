# 从零部署

独立 Supabase `album` 项目已执行 `202610120001_album.sql` 并关闭公众注册和匿名登录，Cloudflare `family-album` 私有桶已设置 CORS，Worker 与 Pages 已部署；合成素材云端冒烟测试通过。正式成员账号和真实设备验收仍待完成。以下步骤用于核对并继续部署，不复用其他网站的账号或数据库。不要把真实密钥提交到 Git 或聊天记录。

## 1. Supabase

项目 `nqjdngemhgmahqjuuxwx` 已在 SQL Editor 执行 `supabase/migrations/202610120001_album.sql`，**不要重复执行**。核对 `profiles`、`photos`、`photo_assets` 的 RLS 已开启，anon 无业务读取权限，`authenticated` 只有本人 SELECT，`album_action` 与 `album_maintenance` 仅 service role 可执行。以后用新增迁移升级。

Auth 的公众注册与匿名登录已关闭，刷新设置页后再次核对；账号由管理员控制台或 `npm run account -- create` 建立四个。受控脚本要求交互确认邮箱属主，不发送邀请。Supabase 的前端 publishable key 可公开；后台 secret key 已在本机私密环境验证管理员接口，后续只能放在 Worker secrets 和本地私密环境中。[Supabase Auth](https://supabase.com/docs/guides/auth)、[API keys](https://supabase.com/docs/guides/getting-started/api-keys)、[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)。

## 2. R2

现有 `family-album` 私有桶的 `r2.dev` 公开访问已关闭。仅限此桶、Object Read & Write 的 S3 API key 已配置，本机只读桶访问检查通过。CORS 已按 `config/r2-cors.example.json` 设置：正式 origin 为 `https://xuan9527zz.github.io`，允许 GET、HEAD、PUT 与所需请求头。CORS 不是权限校验。给桶设置用量提醒；应用 8 GB 预算无法保证供应商账单绝对为零。[R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/)、[R2 价格](https://developers.cloudflare.com/r2/pricing/)。

## 3. Worker

`apps/api/wrangler.toml` 已设置正式前端 origin `https://xuan9527zz.github.io`，并列出必须存在的 Worker secrets：`SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY`、`SUPABASE_SECRET_KEY`、`R2_ACCOUNT_ID`、`R2_BUCKET_NAME`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`。三项密钥只由项目所有者粘贴在本机 Git 忽略的 `apps/api/.dev.vars`，再用 `npx wrangler deploy --config apps/api/wrangler.toml --secrets-file apps/api/.dev.vars` 上传到 Worker。不要通过聊天、命令行参数或 Git 提交密钥。当前 Worker URL 为 `https://family-album-api.xuan1996wyx.workers.dev`，已部署版本 `32dc2ad9-da12-4aa4-9313-0a2f70b5b312`。

Worker 的 `/health` 返回 200；不带凭据访问 `/v1/photos` 返回 401，非允许来源返回 403，允许来源 OPTIONS 预检返回 204。还需用真实测试账号验证端到端调用。后续仅更新代码时可执行 `npm run deploy:api`，已有 secrets 会保留。GitHub Actions 的 Worker 部署工作流是手动触发，需仓库 secret `CLOUDFLARE_API_TOKEN` 与变量 `CLOUDFLARE_ACCOUNT_ID`；Worker 的业务 secrets 仍需在 Cloudflare 安全设置中输入，不由工作流生成。

## 4. GitHub Pages

仓库 `xuan9527zz/album` 只放代码和合成测试素材。Settings → Pages 已选择 **GitHub Actions**；仓库 Variables 已设置 `VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`、`VITE_API_BASE_URL`。`Deploy Pages` 首次运行成功，正式登录页为 `https://xuan9527zz.github.io/album/`。后续前端代码更新后仍需手动触发此工作流发布。

Supabase Auth 的 Site URL 和一条精确 Redirect URL 已设为上述 Pages URL。Worker `ALLOWED_ORIGINS` 与 R2 CORS 为实际 origin `https://xuan9527zz.github.io`。Pages 可公开静态源码，但业务记录与文件必须受后台权限保护。[GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)。

## 5. 真实验收和发布门槛

已用两个临时合成账号在真实 Supabase、Worker、R2 上运行等价冒烟流程：PNG/HEIC 上传及下载 SHA256、重复 PUT 的 412、幂等完成、第二账号读/下载他人照片的 404 均通过。另用真实 R2 验证篡改 MD5 被 HTTP 400 拒绝且没有对象生成、允许来源的签名 GET/CORS/附件响应头，以及浏览器来源的 PUT 预检 204 和上传 200。等待已发 PUT 到期后已完成维护清理并移除所有临时账号；核对 Auth 用户、相册记录、请求计数、预算占用和 R2 对象均为 0。正式成员建立后仍要用真实浏览器登录、上传和退出测试。

再用四部真实 iPhone 分别从“照片”和“文件”App 导入，核对 HEIC 原件、Live 图像及配套视频、下载文件名和 bytes、退出切换账号、主屏幕安装/更新。在中国大陆 Wi-Fi 和移动网络上记录设备、iOS、时间和首屏/大图/上传耗时。测试报告模板见 `docs/TEST_REPORT.md`。如果真实 R2 的条件写入或校验行为不符，先修正实现并重新测，再接纳家庭照片。

回滚：前端从 GitHub Pages 部署历史回退到已知提交；Worker 重新部署已知版本；数据库迁移使用新的修复迁移，不删除已应用迁移。部署版本和迁移顺序记录到交接文档。
