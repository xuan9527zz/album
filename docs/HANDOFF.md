# 维护交接

状态：截至 2026-10-13，工程在 `F:\CodexProjects\相册`，仓库为 `xuan9527zz/album`，正式站点为 `https://xuan9527zz.github.io/album/`。站点已更名为“唯味相册”，有成员资料、选择性共享、共享评论、照片滑动浏览、页内图片缓存；私人照片不会自动共享。本地 SQL/API 38/38、桌面与手机 Chrome 及 WebKit 全流程 15/15、PWA 子路径、真实 R2 合成对象的网关 PUT/GET 冒烟均通过。网关的内部 HTTP 地址泄漏已修复，正式网页的缩略图、大图及页内缓存复用已验证。`xuan` 已在正式站点登录并上传照片；`janice` 与“如”的邀请邮件已发，等待她们自己设置密码。无 VPN 的真实 iPhone 图片显示和上传仍需设备端复测；以 `docs/TEST_REPORT.md` 的实际检查结果为准。

主代码在 `apps/web/src/App.tsx`（界面）、`apps/web/src/session-image-cache.ts`（会话内图片缓存）、`apps/web/src/uploads.ts`（上传）、`apps/api/src/handler.ts`（业务接口）、`apps/api/src/storage.ts`（R2）、`supabase/functions/album-gateway/index.js`（无 VPN 网关）及四份 `supabase/migrations/` 迁移。`scripts/local-server.ts` 的本地模拟有明显标识；生产 API 使用 `apps/api/src/index.ts`。所有密码与密钥只经云控制台或本地私密环境配置，仓库不含它们。

四份迁移按文件名顺序均已执行。Supabase 项目 ID 为 `nqjdngemhgmahqjuuxwx`；Worker 为 `family-album-api.xuan1996wyx.workers.dev`，已部署版本 `fc21e328-d30c-47b9-a249-8403bccb110a`；Pages 最终发布使用提交 `ab3ffd1`。前端 API 入口是 `https://nqjdngemhgmahqjuuxwx.supabase.co/functions/v1/album-gateway`，函数源码由 Supabase 控制台单独部署。合成媒体测试对象已清理；正式账号、记录和私人照片须保留。不要在交接文档记录密钥或邀请链接。计划书原件见 `docs/PRODUCT_BRIEF.md`；后续用户明确提出的共享要求覆盖了计划书中的“不做家庭共享”。

后续 Live 播放或视频浏览不能绕过现有所有者修改权限、容量预留、原件不可覆盖和私密 PWA 缓存边界。共享照片允许启用成员读取和下载，修改及删除仍归所有者；取消共享不会即时撤销已发出的短时链接。新增文件角色应同步 SQL、共享 schema、Worker 校验、维护清理和恢复测试。
