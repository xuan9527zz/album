# 从零部署

独立 Supabase `album` 项目已按顺序执行六次迁移，最新为 `202610140001_story_albums.sql`，并关闭公众注册和匿名登录。Cloudflare `family-album` 私有桶已设置 CORS，Worker 与 Pages 已部署；合成素材云端冒烟测试通过。四位成员均已建立，邀请邮件已发送；真实设备验收仍待完成。以下步骤用于核对并继续部署，不复用其他网站的账号或数据库。不要把真实密钥提交到 Git 或聊天记录。

## 1. Supabase

项目 `nqjdngemhgmahqjuuxwx` 已在 SQL Editor 执行六份迁移，**不要重复执行**。`202610130004_messages_likes_titles_push.sql` 新增独立照片标题、个人点赞、群聊、消息与推送订阅及 `album_v5_action`，未自动共享已有照片。发布顺序为**先运行迁移，再部署 Worker，最后部署 Pages**。`profiles`、`photos`、`photo_assets`、`photo_comments` 及新消息表的 RLS 和函数权限仍应定期审计；anon 无业务读取权限，`authenticated` 只有本人且非最近删除的照片 SELECT；评论、点赞和聊天通过已鉴权的 Worker 与仅 service role 可执行的 RPC 访问。现有照片默认不共享。

影集迁移 `202610140001_story_albums.sql` 于 2026-10-14 执行成功，新增影集及有序照片引用表和 `album_v6_action`，不复制、移动或共享现有照片；新影集默认仅创建者可见。正式 RPC 用非成员参数返回 `NOT_MEMBER`，确认函数可用；之后新版 Worker 与 Pages #18 按序发布。回滚 Worker 或网页时保留已应用的迁移与影集记录。

Auth 的公众注册与匿名登录已关闭，刷新设置页后再次核对；账号由管理员控制台或受控脚本建立，最多启用四个成员。首位成员 `xuan` 已用管理员控制台创建并在正式站点登录、上传一张照片。之后可用 `npm run invite -- 家人邮箱 昵称` 生成私密邀请链接，让受邀人自己设置密码；具体发送与清理步骤见 [维护说明](OPERATIONS.md)。Supabase 的前端 publishable key 可公开；后台 secret key 已在本机私密环境验证管理员接口，后续只能放在 Worker secrets 和本地私密环境中。[Supabase Auth](https://supabase.com/docs/guides/auth)、[API keys](https://supabase.com/docs/guides/getting-started/api-keys)、[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)。

## 2. R2

现有 `family-album` 私有桶的 `r2.dev` 公开访问已关闭。仅限此桶、Object Read & Write 的 S3 API key 已配置，本机只读桶访问检查通过。CORS 已按 `config/r2-cors.example.json` 设置：正式 origin 为 `https://xuan9527zz.github.io`，允许 GET、HEAD、PUT 与所需请求头。CORS 不是权限校验。给桶设置用量提醒；应用 8 GB 预算无法保证供应商账单绝对为零。[R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/)、[R2 价格](https://developers.cloudflare.com/r2/pricing/)。

## 3. Worker

`apps/api/wrangler.toml` 已设置正式前端 origin `https://xuan9527zz.github.io`，并列出必须存在的 Worker secrets：`SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY`、`SUPABASE_SECRET_KEY`、`R2_ACCOUNT_ID`、`R2_BUCKET_NAME`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY` 和 `VAPID_SUBJECT`。密钥只保存在本机 Git 忽略的 `apps/api/.dev.vars` 和 Cloudflare Worker secrets，不通过聊天、命令行参数或 Git 提交。当前 Worker URL 为 `https://family-album-api.xuan1996wyx.workers.dev`，已部署版本 `4bad5e00-f437-4ff8-b4d1-5c793588780d`，每 6 小时执行一次到期清理。

Worker 的 `/health` 返回 200，匿名 `/v1/photos` 返回 401；网关相同检查也通过。后续仅更新代码时可执行 `npm run deploy:api`，已有 secrets 会保留。[Deploy Worker #1](https://github.com/xuan9527zz/album/actions/runs/38361893577) 因仓库尚未设置 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID` 而失败；本次改用本机已登录的 Wrangler 成功发布。不要把本机 OAuth 凭据复制到仓库。

`supabase/functions/album-gateway/index.js` 将 `/health` 和 `/v1/*` 转发至固定 Worker，业务请求仍由 Worker 核验 Supabase JWT。新版把业务响应中的 R2 短时签名链接包装为固定公开 HTTPS 地址下的 `/media?target=...`，仅允许固定账户、固定桶、带签名的 GET/PUT，流式传输图片和上传文件；R2 仍核验签名，私有桶未公开。不能从 Edge Function 的 `request.url` 推导浏览器链接 origin：Supabase 内部可能传入 HTTP，导致 HTTPS 页面拒绝图片和上传。浏览器来源限制为正式 Pages origin。函数在 Supabase 控制台单独部署，旧版 JWT 入口检查关闭；仅推送 GitHub 仓库不会自动更新函数。合成 1 MiB 对象经网关 PUT/GET 字节一致，测试对象已清理。GitHub Actions 变量 `VITE_API_BASE_URL` 为 `https://nqjdngemhgmahqjuuxwx.supabase.co/functions/v1/album-gateway`。[Supabase Edge Functions](https://supabase.com/docs/guides/functions/quickstart)、[函数认证](https://supabase.com/docs/guides/functions/auth)、[R2 签名 URL 域名限制](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)。

## 4. GitHub Pages

仓库 `xuan9527zz/album` 只放代码和合成测试素材。Settings → Pages 已选择 **GitHub Actions**；仓库 Variables 已设置 `VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`、`VITE_API_BASE_URL`。[Deploy Pages #15](https://github.com/xuan9527zz/album/actions/runs/38397051157) 从提交 `3fe92f3` 构建最终网站；正式站点为 `https://xuan9527zz.github.io/album/`。后续前端代码更新后仍需手动触发此工作流发布。

Supabase Auth 的 Site URL 和一条精确 Redirect URL 已设为上述 Pages URL。Worker `ALLOWED_ORIGINS` 与 R2 CORS 为实际 origin `https://xuan9527zz.github.io`。Pages 可公开静态源码，但业务记录与文件必须受后台权限保护。[GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)。

iPhone 锁屏推送需要 iOS 16.4 或更新版本：用户从 Safari 将相册加入主屏幕，从主屏幕图标打开，在“消息”页点击“开启锁屏推送”，再允许系统通知。只在 Safari 标签页打开时不能完成 iPhone Web Push 订阅。每位成员和每台设备分别授权；正式设备送达尚待验证。[Apple Web Push 文档](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)。

## 5. 真实验收和发布门槛

已用两个临时合成账号在真实 Supabase、Worker、R2 上运行等价冒烟流程：PNG/HEIC 上传及下载 SHA256、重复 PUT 的 412、幂等完成、第二账号读/下载他人照片的 404 均通过。另用真实 R2 验证篡改 MD5 被 HTTP 400 拒绝且没有对象生成、允许来源的签名 GET/CORS/附件响应头，以及浏览器来源的 PUT 预检 204 和上传 200。等待已发 PUT 到期后已完成维护清理并移除所有临时账号；在正式开户前核对 Auth 用户、相册记录、请求计数、预算占用和 R2 对象均为 0。现在正式成员数据已产生，不能按旧结果清空。仍要在真实 iPhone 完成上传、下载和账号隔离测试。

再用四部真实 iPhone 分别从“照片”和“文件”App 导入，核对 HEIC 原件、Live 图像及配套视频、下载文件名和 bytes、退出切换账号、主屏幕安装/更新。在中国大陆 Wi-Fi 和移动网络上记录设备、iOS、时间和首屏/大图/上传耗时。测试报告模板见 `docs/TEST_REPORT.md`。如果真实 R2 的条件写入或校验行为不符，先修正实现并重新测，再接纳家庭照片。

回滚：前端从 GitHub Pages 部署历史回退到已知提交；Worker 重新部署已知版本；数据库迁移使用新的修复迁移，不删除已应用迁移。部署版本和迁移顺序记录到交接文档。
