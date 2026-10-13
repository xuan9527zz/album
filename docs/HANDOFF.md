# 维护交接

状态：截至 2026-10-13，工程在 `F:\CodexProjects\相册`，仓库为 `xuan9527zz/album`，正式站点为 `https://xuan9527zz.github.io/album/`。站点已更名为“唯味相册”，有成员资料编辑和选择性家庭共享相册；现有私人照片没有自动共享。本地 SQL/API、桌面与手机尺寸浏览器、PWA 子路径和此前真实 Supabase/R2 合成素材冒烟测试已通过。`xuan` 已在正式站点登录并上传照片；`janice` 与“如”的邀请邮件已发，等待她们自己设置密码。新增 Supabase Edge Function 网关后，一部 iPhone 在关闭 VPN 时已确认登录和照片浏览正常；四部 iPhone 与不同网络的完整验收仍待完成。以 `docs/TEST_REPORT.md` 的实际检查结果为准。

主代码在 `apps/web/src/App.tsx`（界面）、`apps/web/src/uploads.ts`（原件和派生上传）、`apps/api/src/handler.ts`（业务接口）、`apps/api/src/storage.ts`（R2）、`supabase/migrations/202610120001_album.sql`（RLS、预算与状态事务）、`supabase/migrations/202610130001_shared_album_profiles.sql`（共享与个人资料）和 `supabase/migrations/202610130002_trash_batch_search.sql`（最近删除、批量与查找）。`scripts/local-server.ts` 的本地模拟有明显标识；生产 API 使用 `apps/api/src/index.ts`。所有密码与密钥只经云控制台或本地私密环境配置，仓库不含它们。

三份迁移按文件名顺序均已执行。Supabase 项目 ID 为 `nqjdngemhgmahqjuuxwx`；Worker 为 `family-album-api.xuan1996wyx.workers.dev`，已部署版本 `2b6823c8-6b6b-4faf-815d-3ba8ad9f99c0`；Pages 发布的前端提交为 `c5bf299`。前端 API 入口是 `https://nqjdngemhgmahqjuuxwx.supabase.co/functions/v1/album-gateway`，函数源码在 `supabase/functions/album-gateway/index.js`，由 Supabase 控制台单独部署。合成测试账号与链接均已清理；正式账号、记录和私人照片须保留。不要在交接文档记录密钥或邀请链接。计划书原件见 `docs/PRODUCT_BRIEF.md`；后续用户明确提出的共享要求覆盖了计划书中的“不做家庭共享”。

后续 Live 播放或视频浏览不能绕过现有所有者修改权限、容量预留、原件不可覆盖和私密 PWA 缓存边界。共享照片允许启用成员读取和下载，修改及删除仍归所有者；取消共享不会即时撤销已发出的短时链接。新增文件角色应同步 SQL、共享 schema、Worker 校验、维护清理和恢复测试。
