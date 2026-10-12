# 拾光相册

四位固定家庭成员各自使用的私密照片相册。前端是可安装到 iPhone 主屏幕的静态 PWA；Supabase Auth 和 PostgreSQL 负责身份与记录，Cloudflare Worker 授权私有 R2 文件。每人的照片默认只对本人可见，上传原件与浏览图片分开保存。

**当前状态（2026-10-13）：** [正式相册](https://xuan9527zz.github.io/album/) 与 [Worker](https://family-album-api.xuan1996wyx.workers.dev/health) 已部署；独立 Supabase 项目已执行数据库迁移，公众注册和匿名登录已关闭，R2 桶保持私有。首位正式成员已登录并上传照片；其余成员和真实 iPhone、中国大陆网络验收仍待完成。合成素材通过了真实云端上传、下载校验和跨账号隔离测试。演示里只有程序生成的合成风景，生产构建不启用演示账号。请从 [部署步骤](docs/DEPLOYMENT.md) 继续开户和设备验收。

## 本地运行

需要 Node.js 24（最低 22.12）、npm。当前工作机的系统 Node 较旧，开发时可将 Codex 提供的 Node 24 目录加到 PATH；CI 使用 Node 24。

```sh
npm ci
npm run dev:local
```

打开 `http://127.0.0.1:5173/`。页面显示“本地演示”，可选四个隔离的示例账号，后台是真实 SQL 迁移运行于内存 PostgreSQL 兼容引擎与模拟对象存储；服务重启会清空。生产构建强制拒绝 `VITE_LOCAL_DEMO=true`。

```sh
npm run typecheck
npm test
npm run build
npm run build:api
npm run test:e2e
npm run test:pwa
```

`npm run test:e2e` 默认运行桌面和手机尺寸的 Chromium；设置 `TEST_WEBKIT=true` 增加 WebKit，设置 `TEST_HEIC=true` 运行仓库里的合成 HEIC 测试。运行前需用 `npx playwright install chromium webkit` 安装测试浏览器。Docker 不必用于默认本地测试。真实云集成运行 `npm run test:cloud`，需要先按部署文档配置服务和测试账号，运行时在终端交互输入密码。实际结果与未测项见 [测试报告](docs/TEST_REPORT.md)。

## 功能

- 邮箱密码登录、启用名单、四人上限、行级权限与后台逐操作归属检查。
- 精选、按拍摄日期排序的全部照片、详情、日期地点编辑、原件下载与确认删除。
- JPEG、PNG、HEIC/HEIF 原件；独立生成 JPEG 预览和缩略图。预览失败保留原件，可在详情重试。
- Live Photo 静态图加 MOV/MP4 配套视频的手动组合；记录“尚未验证配对”，不承诺播放或还原为 iOS Live Photo。
- 多文件队列、最多两个并发、SHA256/Content-MD5、幂等重试、容量预留、到期清理。
- GitHub Pages `/album/` 子路径、iPhone 安全区、公开页面外壳离线缓存；照片和授权链接不纳入 Service Worker 缓存。

## 工程

| 路径 | 用途 |
| --- | --- |
| `apps/web/` | React、手机界面、Web Workers、PWA |
| `apps/api/` | Worker、JWT 核验、业务 API、R2 授权 |
| `packages/shared/` | 类型与输入约束 |
| `supabase/migrations/` | 数据库迁移、RLS、原子事务函数 |
| `scripts/` | 本地演示、测试、账号、维护、备份 |
| `tests/` | SQL/API 与浏览器测试、合成素材 |
| `.github/workflows/` | 检查与受控部署 |

架构与不可变原件方案见 [ARCHITECTURE.md](docs/ARCHITECTURE.md)；日常维护、恢复和备份见 [OPERATIONS.md](docs/OPERATIONS.md)。不要把真实照片、私密密钥、密码或授权链接提交到 Git。
