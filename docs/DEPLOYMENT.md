# 从零部署

独立 Supabase `album` 项目已按顺序执行十三次迁移，最新为 `202610150004_temporary_music.sql`，并关闭公众注册和匿名登录。Cloudflare `family-album` 私有桶已设置 CORS。四位成员均已建立，邀请邮件已发送；真实设备验收仍待完成。最新连接入口与 Worker 版本见 [登录连接发布记录](LOGIN_CONNECTION_RELEASE.md)，网关及临时 MP3 见 [上传配乐发布记录](TEMPORARY_MUSIC_RELEASE.md)，完整跨页和共享照片见 [取景发布记录](ZINE_FRAMING_RELEASE.md)。下文保留历次部署记录，不复用其他网站的账号或数据库。不要把真实密钥提交到 Git 或聊天记录。

## 1. Supabase

2026-10-15 文件 BGM 和同步放映已从 `63752bc` 经 [Pages #30](https://github.com/xuan9527zz/album/actions/runs/38622320070) 发布，[Checks #53](https://github.com/xuan9527zz/album/actions/runs/38622272307) 全部通过（49 项数据库/API、60 项浏览器、PWA）。第十次迁移及 Worker 已按序更新；正式工作台和试播页已核对配乐选择、默认秒数、一键播放和暂停。使用记录与设备验收范围见 [BGM 发布说明](BGM_RELEASE.md)。

2026-10-14 手机上传修复：第九次迁移 `202610140004_photo_filenames.sql` 已在正式库成功执行，内容与本地长度/FNV 校验一致。新增命名 RPC 与原始来源文件名字段；新保存文件按“上传者昵称_实际照片ID.后缀”命名，断点恢复继续识别源文件。旧照片的下载名称也采用此格式，不改动对象键或图片字节。非成员 RPC 返回预期 `NOT_MEMBER`。Worker `556f94a1-636f-42a9-bbf9-30385e01c6ff` 已发布，健康与鉴权检查通过。[Pages #21](https://github.com/xuan9527zz/album/actions/runs/38545909210) 从 `b5848e2` 发布成功；正式 390px 上传页用两张合成图片核对文件名、非空日期和字段宽度，没有保存测试图片到正式相册。

项目 `nqjdngemhgmahqjuuxwx` 已在 SQL Editor 执行十份迁移，**不要重复执行**。`202610130004_messages_likes_titles_push.sql` 新增独立照片标题、个人点赞、群聊、消息与推送订阅及 `album_v5_action`，未自动共享已有照片。发布顺序为**先运行迁移，再部署 Worker，最后部署 Pages**。`profiles`、`photos`、`photo_assets`、`photo_comments` 及新消息表的 RLS 和函数权限仍应定期审计；anon 无业务读取权限，`authenticated` 只有本人且非最近删除的照片 SELECT；评论、点赞和聊天通过已鉴权的 Worker 与仅 service role 可执行的 RPC 访问。现有照片默认不共享。

影集迁移 `202610140001_story_albums.sql` 于 2026-10-14 执行成功，新增影集及有序照片引用表和 `album_v6_action`，不复制、移动或共享现有照片；新影集默认仅创建者可见。正式 RPC 用非成员参数返回 `NOT_MEMBER`，确认函数可用；之后新版 Worker 与 Pages #18 按序发布。回滚 Worker 或网页时保留已应用的迁移与影集记录。

2026-10-14 Zine 更新：第七次迁移 `202610140002_zine_templates.sql` 和第八次 `202610140003_story_music_public.sql` 已按序在正式 SQL Editor 执行成功，粘贴内容与本地文件长度及 FNV 校验一致。增加三套模板、`zine_config`、颜色、音乐和可撤销链接；旧影集与照片仍保留。新函数以非成员参数返回预期 `NOT_MEMBER`，无效公开令牌返回 `NOT_FOUND`。新表无 anon/authenticated 直接权限；仅鉴权的所有者可生成链接，公开读取不包含原件。没有为现有影集创建公开链接。后续应保留已应用的八次迁移，不能重复运行。

Worker 已发布为 `99a431d0-5097-4bcf-b65e-f5e2eb9a3c74`，影集使用 `album_v8_action`。新版网关 `index.js` 已在控制台单独部署，内容与本地长度及 FNV 校验一致；仅允许匿名 GET 精确的 64 位令牌路径，其他业务接口仍鉴权。Worker/网关 `/health` 均 200，匿名影集列表均 401，无效公开令牌均 404，匿名公开路径 POST 均 401。R2 桶仍私有。

[Pages #20](https://github.com/xuan9527zz/album/actions/runs/38519341016) 从 `15111c7` 构建发布成功，[Checks #36](https://github.com/xuan9527zz/album/actions/runs/38519253304) 全流程成功。正式影集工作台已核对三套模板、颜色和音乐设置；“我的”显示 31 项本机资源已预装。线上新 bundle 包含音乐、链接与 PDF，全部 12 份字体 HTTP 200，Service Worker 预存字体、PDF 和 HEIC 工具。前端处理 `/album/` 前缀，勿改成根目录字体路径。此次没有保存正式影集或对家庭照片生成公开链接；功能写入与导出以本地合成素材验收，真实 iPhone 仍待设备端验证。

Auth 的公众注册与匿名登录已关闭，刷新设置页后再次核对；账号由管理员控制台或受控脚本建立，最多启用四个成员。首位成员 `xuan` 已用管理员控制台创建并在正式站点登录、上传一张照片。之后可用 `npm run invite -- 家人邮箱 昵称` 生成私密邀请链接，让受邀人自己设置密码；具体发送与清理步骤见 [维护说明](OPERATIONS.md)。Supabase 的前端 publishable key 可公开；后台 secret key 已在本机私密环境验证管理员接口，后续只能放在 Worker secrets 和本地私密环境中。[Supabase Auth](https://supabase.com/docs/guides/auth)、[API keys](https://supabase.com/docs/guides/getting-started/api-keys)、[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)。

## 2. R2

现有 `family-album` 私有桶的 `r2.dev` 公开访问已关闭。仅限此桶、Object Read & Write 的 S3 API key 已配置，本机只读桶访问检查通过。CORS 已按 `config/r2-cors.example.json` 设置：正式 origin 为 `https://xuan9527zz.github.io`，允许 GET、HEAD、PUT 与所需请求头。CORS 不是权限校验。给桶设置用量提醒；应用 8 GB 预算无法保证供应商账单绝对为零。[R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/)、[R2 价格](https://developers.cloudflare.com/r2/pricing/)。

## 3. Worker

`apps/api/wrangler.toml` 已设置正式前端 origin `https://xuan9527zz.github.io`，并列出必须存在的 Worker secrets：`SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY`、`SUPABASE_SECRET_KEY`、`R2_ACCOUNT_ID`、`R2_BUCKET_NAME`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY` 和 `VAPID_SUBJECT`。密钥只保存在本机 Git 忽略的 `apps/api/.dev.vars` 和 Cloudflare Worker secrets，不通过聊天、命令行参数或 Git 提交。当前 Worker URL 为 `https://family-album-api.xuan1996wyx.workers.dev`，已部署版本 `556f94a1-636f-42a9-bbf9-30385e01c6ff`，每 6 小时执行一次到期清理。

Worker 的 `/health` 返回 200，匿名 `/v1/photos` 返回 401；网关相同检查也通过。后续仅更新代码时可执行 `npm run deploy:api`，已有 secrets 会保留。[Deploy Worker #1](https://github.com/xuan9527zz/album/actions/runs/38361893577) 因仓库尚未设置 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID` 而失败；本次改用本机已登录的 Wrangler 成功发布。不要把本机 OAuth 凭据复制到仓库。

`supabase/functions/album-gateway/index.js` 将 `/health` 和 `/v1/*` 转发至固定 Worker，业务请求仍由 Worker 核验 Supabase JWT。新版把业务响应中的 R2 短时签名链接包装为固定公开 HTTPS 地址下的 `/media?target=...`，仅允许固定账户、固定桶、带签名的 GET/PUT，流式传输图片和上传文件；R2 仍核验签名，私有桶未公开。不能从 Edge Function 的 `request.url` 推导浏览器链接 origin：Supabase 内部可能传入 HTTP，导致 HTTPS 页面拒绝图片和上传。浏览器来源限制为正式 Pages origin。函数在 Supabase 控制台单独部署，旧版 JWT 入口检查关闭；仅推送 GitHub 仓库不会自动更新函数。合成 1 MiB 对象经网关 PUT/GET 字节一致，测试对象已清理。GitHub Actions 变量 `VITE_API_BASE_URL` 为 `https://nqjdngemhgmahqjuuxwx.supabase.co/functions/v1/album-gateway`。[Supabase Edge Functions](https://supabase.com/docs/guides/functions/quickstart)、[函数认证](https://supabase.com/docs/guides/functions/auth)、[R2 签名 URL 域名限制](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)。

## 4. GitHub Pages

2026-10-15 文件 BGM 与同步放映：生产已执行第十次迁移 `202610150001_story_playback.sql`，新 RPC 存在，anon 不可执行、service_role 可执行。Worker 已更新为 `cd0081b3-0f36-46f6-9121-92265afc334e`，调用 `album_v10_action`；网关健康 200、匿名影集列表 401、无效公开令牌 404。新增文件配乐目录、2–60 秒翻页间隔和底部统一播放控制；网关路由无变化。操作说明见 [BGM 发布说明](BGM_RELEASE.md)。

iPhone 配乐最终修复：[Pages #29](https://github.com/xuan9527zz/album/actions/runs/38614031132) 从 `75f3fdc` 发布成功，[Checks #51](https://github.com/xuan9527zz/album/actions/runs/38613942429) 全部通过（49 项数据库/API、63 项浏览器及 PWA）。用户在真实 iPhone 打开 `?refresh=ios-music-20261015-r2#/music-trial` 后确认无需切换兼容模式便可直接播放。原生播放遇错后同一 URL 可重试，翻页保留播放器。数据库、API 和歌曲内容均无变动。

2026-10-15 iPhone 配乐修复：[Pages #28](https://github.com/xuan9527zz/album/actions/runs/38612411124) 从 `3abc2bc` 发布成功。iPhone/iPad 默认原生 HTTP 音频，由浏览器缓冲，准备阶段可点击播放；其他设备 Blob 解码失败自动切换。新试播入口 `?refresh=ios-music-20261015#/music-trial` 可避开旧 HTML。正式入口 `index-ovO172TI.js`，线上已确认自动选择逻辑和新提示存在；设备端自动选择仍待用户复测。没有迁移、API 或音乐文件内容变动。

2026-10-15 MP3 公开试播：[Pages #27](https://github.com/xuan9527zz/album/actions/runs/38609640817) 从 `650cfea` 发布成功。`https://xuan9527zz.github.io/album/music/whenever.mp3` 为公开静态音频直链，`#/music-trial` 为无需登录的示例影集；新入口可使用 `?refresh=music-20261015#/music-trial` 绕过旧 HTML 缓存。原文件大小/SHA256 及线上 206 范围读取已验证，正式桌面网页达到 100% 后点击播放和翻页均正常；真实 iPhone 待验证。MP3 不加入 PWA 永久预装。此发布没有运行数据库迁移或更新 API，工作台现有音乐配置未改变。

2026-10-15 预装修复：大资源采用流式进度和无数据停滞计时，固定 30 秒的整项中断已移除；正在接收数据的资源可继续，45 秒无数据或单项超过 10 分钟才中断。前台会自动补下缺失项并退避重试，联网和回到前台会重新检查；已完成的资源不重复下载。新界面显示资源名称与 MB 进度，配额不足会提示并保留已有缓存。只改前端和 Service Worker，不新增迁移或修改接口。真实设备验收时核对大字体的 MB 进度、短暂断网后恢复、从主屏幕重新打开及最终“已预装”；不能用本地慢网模拟替代 iPhone 实测。

预装修复已由 [Pages #26](https://github.com/xuan9527zz/album/actions/runs/38600665515) 从 `96c44c3` 发布，[Checks #46](https://github.com/xuan9527zz/album/actions/runs/38600557487) 完整通过。新缓存为 `album-shell-f5ec9935bc9abe`，入口脚本 `index-Cv9sCE16.js`，仍有 31 项公开程序资源。桌面正式 PWA 更新后显示“已预装”，实际 iPhone 复测待完成。数据库仍为九次迁移，API Worker 版本不变。

2026-10-15 更新流程补充：关键 shell 安装完成即可提示切换，大字体和 PDF/HEIC 等工具通过激活后的后台预装继续保存；30 秒超时不会阻止更新。已有字体可跨版本复用，新资源完整准备前保留旧缓存。更新提示高于导出弹窗，回到前台会检查新版，切换以 Worker 实际激活为准。若设备仍显示没有“取消制作”的旧 PDF 窗口，可完全关闭旧相册后在 Safari 打开带 `?refresh=pdf-20261015` 的站点入口再更新。该参数用于绕过旧的入口缓存，不清空家庭数据；真实 iPhone 的新版制作结果仍待确认。

该修复已从 `dcdab82` 通过 [Pages #25](https://github.com/xuan9527zz/album/actions/runs/38594797583) 成功发布，[Checks #43](https://github.com/xuan9527zz/album/actions/runs/38594738765) 完整通过。正式 Worker 缓存 `album-shell-f36538d64c268f`，入口脚本 `index-DeMNPzfk.js`；桌面正式相册更新及实际 3 页 PDF 下载核对完成。本次无需数据库迁移或接口重新发布，Worker 仍为 `556f94a1-636f-42a9-bbf9-30385e01c6ff`。

2026-10-14 PDF 卡住修复已由 [Pages #22](https://github.com/xuan9527zz/album/actions/runs/38554282464) 从 `c38f593` 发布。正式 PWA 通过“新版本已准备好 · 点击刷新”启用后，导出窗口出现“取消制作”，正式影集生成并下载为有效的 3 页 PDF；没有生成公开观看链接或改动照片/影集记录。导出专用请求支持取消/超时，字体超时以系统字体继续，图片和画布临时内存会释放；另修复导出窗口继承工具栏不换行造成的横向滚动。三浏览器 12 项 PDF 故障恢复及全部模板检查通过，真实 iPhone PWA 的制作和保存仍需用户复测。

仓库 `xuan9527zz/album` 放代码、合成测试素材及用户明确要求公开托管的 `music/whenever.mp3`（大小/SHA256 白名单见 `config/public-music.json`），不存家庭照片。Settings → Pages 已选择 **GitHub Actions**；仓库 Variables 已设置 `VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`、`VITE_API_BASE_URL`。[Deploy Pages #15](https://github.com/xuan9527zz/album/actions/runs/38397051157) 从提交 `3fe92f3` 构建最终网站；正式站点为 `https://xuan9527zz.github.io/album/`。后续前端代码更新后仍需手动触发此工作流发布。

Supabase Auth 的 Site URL 和一条精确 Redirect URL 已设为上述 Pages URL。Worker `ALLOWED_ORIGINS` 与 R2 CORS 为实际 origin `https://xuan9527zz.github.io`。Pages 可公开静态源码，但业务记录与文件必须受后台权限保护。[GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)。

iPhone 锁屏推送需要 iOS 16.4 或更新版本：用户从 Safari 将相册加入主屏幕，从主屏幕图标打开，在“消息”页点击“开启锁屏推送”，再允许系统通知。只在 Safari 标签页打开时不能完成 iPhone Web Push 订阅。每位成员和每台设备分别授权；正式设备送达尚待验证。[Apple Web Push 文档](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)。

## 5. 真实验收和发布门槛

已用两个临时合成账号在真实 Supabase、Worker、R2 上运行等价冒烟流程：PNG/HEIC 上传及下载 SHA256、重复 PUT 的 412、幂等完成、第二账号读/下载他人照片的 404 均通过。另用真实 R2 验证篡改 MD5 被 HTTP 400 拒绝且没有对象生成、允许来源的签名 GET/CORS/附件响应头，以及浏览器来源的 PUT 预检 204 和上传 200。等待已发 PUT 到期后已完成维护清理并移除所有临时账号；在正式开户前核对 Auth 用户、相册记录、请求计数、预算占用和 R2 对象均为 0。现在正式成员数据已产生，不能按旧结果清空。仍要在真实 iPhone 完成上传、下载和账号隔离测试。

再用四部真实 iPhone 分别从“照片”和“文件”App 导入，核对 HEIC 原件、Live 图像及配套视频、下载文件名和 bytes、退出切换账号、主屏幕安装/更新。在中国大陆 Wi-Fi 和移动网络上记录设备、iOS、时间和首屏/大图/上传耗时。测试报告模板见 `docs/TEST_REPORT.md`。如果真实 R2 的条件写入或校验行为不符，先修正实现并重新测，再接纳家庭照片。

回滚：前端从 GitHub Pages 部署历史回退到已知提交；Worker 重新部署已知版本；数据库迁移使用新的修复迁移，不删除已应用迁移。部署版本和迁移顺序记录到交接文档。
