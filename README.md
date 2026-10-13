# 唯味相册

最多四位家庭成员使用的照片相册。前端是静态 PWA；Supabase Auth 和 PostgreSQL 负责身份与记录，Cloudflare Worker 授权私有 R2 文件。照片默认只对本人可见，成员可选择放入家庭共享相册；只有所有者能编辑、移出共享或删除。每位成员可设置自己的昵称和头像。上传原件与浏览图片分开保存。

**当前状态（2026-10-13）：** [正式相册](https://xuan9527zz.github.io/album/) 已发布为“唯味相册”，[Supabase 接口入口](https://nqjdngemhgmahqjuuxwx.supabase.co/functions/v1/album-gateway/health) 转发业务接口与短时签名的图片读写；五次数据库迁移已部署。共享评论、个人点赞精选、全家群聊、评论/点赞消息、可选锁屏推送、上传前预览与标题/时间/地点编辑、左右滑动、页内图片缓存、最近删除、批量管理及快速查找已开发；发布与核对记录见 [部署步骤](docs/DEPLOYMENT.md)。公众注册和匿名登录已关闭，R2 桶保持私有。正式网页已验证照片列表与消息页读取；成员邀请邮件已发送。锁屏推送与真实上传、下载仍需在家庭成员的 iPhone 上验证。生产构建不启用演示账号。

**开发中（2026-10-14）：** 影集工作台已在本地实现：从私人或共享照片选图、调整顺序、选择三种画面模板与三种切换动画，保存后可在电脑和手机上翻阅或自动放映。影集默认私密；只有全部照片已共享时才能将影集分享给家人。影集只引用照片，不复制原图，暂不包含 BGM 或 MP4 导出。第六次迁移 `202610140001_story_albums.sql` 与新版 Worker、网页尚未发布到正式服务。

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
- 最近删除保留 30 天，可恢复或主动永久删除；按年份、月份、地点和共享上传者查找；最多 50 张的批量精选、共享和移入最近删除。
- 详情中的上一张/下一张按钮及左右滑动；共享照片可留最多 30 字的评论，本人或照片主人可删除，单张照片最多 200 条。
- 底部“消息”集中显示评论和点赞通知，并提供全家群聊；共享照片的个人点赞会进入点赞者自己的精选，不改变照片主人的精选。支持在已添加到 iPhone 主屏幕的网站中开启锁屏推送。
- 右上角上传入口支持选中后的照片预览，并分别编辑标题、拍摄时间和地点；标题与地点独立保存。
- JPEG、PNG、HEIC/HEIF 原件；独立生成 JPEG 预览和缩略图。预览失败保留原件，可在详情重试。
- Live Photo 静态图加 MOV/MP4 配套视频的手动组合；记录“尚未验证配对”，不承诺播放或还原为 iOS Live Photo。
- 多文件队列、最多两个并发、SHA256/Content-MD5、幂等重试、容量预留、到期清理。
- GitHub Pages `/album/` 子路径、iPhone 安全区、公开页面外壳离线缓存；缩略图和预览图在当前页面内存中临时复用，上限 64 MiB，退出登录或关闭页面时释放，不纳入 Service Worker 持久缓存。

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
