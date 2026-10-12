# 维护交接

状态：截至 2026-10-13，工程在 `F:\CodexProjects\相册`，仓库为 `xuan9527zz/album`，登录页为 `https://xuan9527zz.github.io/album/`。本地 SQL/API、桌面与手机尺寸浏览器、WebKit 合成 HEIC、PWA 子路径和真实 Supabase/R2 合成素材冒烟测试已通过；四名正式成员、四部 iPhone 和中国大陆网络仍未验收。以 `docs/TEST_REPORT.md` 的实际检查结果为准。

主代码在 `apps/web/src/App.tsx`（界面）、`apps/web/src/uploads.ts`（原件和派生上传）、`apps/api/src/handler.ts`（业务接口）、`apps/api/src/storage.ts`（R2）、`supabase/migrations/202610120001_album.sql`（RLS、预算与状态事务）。`scripts/local-server.ts` 的本地模拟有明显标识；生产 API 使用 `apps/api/src/index.ts`。所有密码与密钥只经云控制台或本地私密环境配置，仓库不含它们。

迁移顺序目前只有已执行的 `202610120001_album.sql`。Supabase 项目 ID 为 `nqjdngemhgmahqjuuxwx`；Worker 为 `family-album-api.xuan1996wyx.workers.dev`，已部署版本 `32dc2ad9-da12-4aa4-9313-0a2f70b5b312`；Pages 最新发布的前端提交为 `3c98c99`。合成云端验收后的 Auth 用户、业务表记录、预算占用和 R2 对象已清零。不要在交接文档记录密钥。计划书原件见 `docs/PRODUCT_BRIEF.md`；如需改变架构，先更新架构文档、迁移和测试。

后续共享、Live 播放或视频浏览不能绕过现有 owner 检查、容量预留、原件不可覆盖和私密 PWA 缓存边界。新增文件角色应同步 SQL、共享 schema、Worker 校验、维护清理和恢复测试。
