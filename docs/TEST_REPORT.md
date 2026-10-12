# 测试报告（2026-10-13）

测试对象是本仓库尚未部署的工程。浏览器测试运行本地演示：数据库迁移在 PGlite 内执行，对象传输由内存存储模拟；这些结果不等于 Supabase、R2 或 iPhone 的真实端到端验收。测试图片、HEIC、MP4 均为合成素材，无真实家庭照片、GPS 或账号信息。

| 检查 | 实际结果 | 范围 |
| --- | --- | --- |
| `npm run typecheck` | 通过 | TypeScript 7 静态检查 |
| `npm test` | 25/25 通过 | SQL 迁移、RLS、API、容量与幂等、跨账号隔离、原件不可覆盖和 SHA、预览替换清理、Live 视频补传状态、2,000 条分页 |
| `TEST_HEIC=true TEST_WEBKIT=true npm run test:e2e` | 6/6 通过 | 桌面 Chrome、手机尺寸 Chrome、WebKit 的登录、上传、下载、编辑、精选、删除、切换账号；合成 HEIC 原件/JPEG 预览和合成 MP4 配套视频 |
| `npm run build` | 通过 | 生产前端产物；大 HEIC 转换依赖导致 Vite 提示大 chunk，按需加载转换代码 |
| `npm run build:api` | 通过 | Wrangler Worker dry-run 打包；不代表已部署 |
| `npm run test:pwa` | 通过 | `/album/` 子路径、manifest/scope、hash 刷新、公开外壳离线、私密请求不缓存 |

本地数据库/API 测试中的 Live 视频使用带 MP4 文件标识的合成字节核对保存、下载、重复角色拒绝与“手动组合，尚未验证配对”状态。浏览器测试使用从合成风景编码的 H.264 MP4，核对手动组合和下载的字节。这不证明视频与静态图属于同一张真实 Live Photo，也不证明能够导回 iOS；真实 iPhone 素材仍须验收。

真实云端配置的部分检查：在独立 Supabase `album` 项目执行了 `202610120001_album.sql`，SQL Editor 显示成功；匿名使用 publishable key 读取 `photos` 返回 HTTP 401 / SQLSTATE `42501`。Supabase 后台密钥已在本机通过管理员接口验证，Auth 设置页关闭了公众注册和匿名登录，刷新后确认生效。Cloudflare 的 `family-album` 桶保持 `r2.dev` 公开访问关闭，CORS 已设置为仅允许 `https://xuan9527zz.github.io` 的 GET、HEAD、PUT，桶级 S3 密钥只读检查通过。Worker `32dc2ad9-da12-4aa4-9313-0a2f70b5b312` 已部署；`/health` 200、匿名 `/v1/photos` 401、禁止来源 403、允许来源 OPTIONS 204。尚未验证完整登录和文件上传链路。

## 尚未实际验证

- **真实云集成：** 尚无测试成员账号，未运行 `npm run test:cloud`。真实 R2 条件 PUT、浏览器 CORS、签名请求、ETag/MD5 行为，真实 Supabase Auth/RLS 及云端跨账号攻击仍待验证。
- **发布：** 数据库迁移和 Worker 部署已完成，GitHub Pages 还未发布；有 Worker URL 和版本，尚无可供成员使用的前端 URL。
- **真实设备与网络：** 未在四部 iPhone 实测照片选择器、文件 App、HEIC、Live 配对、原件下载、主屏幕安装、锁屏中断恢复，也未在中国大陆 Wi-Fi/移动网络测量首屏、预览或上传耗时。
- **真实照片特征：** 尚未用经许可的竖拍、旋转/镜像、广色域和 EXIF GPS 照片核验预览方向、颜色和时间/地点提取。仓库不能存放真实私人素材。
- **长时运行：** 未做持续故障注入或真实 8 GB 用量压力测试；2,000 条记录检查只覆盖分页完整性。

部署后按 [部署步骤](DEPLOYMENT.md) 运行云端冒烟测试和四名成员的隔离检查，并记录项目环境、提交 SHA、设备/iOS、运营商与网络、测试时间、首次及重复访问的首屏与大图时间、上传耗时、失败与修复。通过后再接纳家庭照片；不要用本地模拟结果替代这些记录。
