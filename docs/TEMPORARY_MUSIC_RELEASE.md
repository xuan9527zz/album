# 上传配乐与观看适配（2026-10-15）

工作台“背景音乐”支持上传不超过 20 MB 的 MP3，显示上传和保存进度，并自动选中刚上传的曲目。每位启用成员最多同时保留 8 首有效配乐；曲目仅出现在上传者自己的选择列表，可用于其影集及公开链接。文件实际保存在 `xuan9527zz/album` 的 `album-bgm` GitHub Release 附件，使用随机 UUID 文件名，不提交 Git 历史，也不触发网站重建。该仓库为公开仓库，Release 附件属于公开托管内容。

成功保存起 72 小时后，音乐流接口返回 410，已打开页面也会暂停并移除音频源，显示“配乐已过期”；影集仍可静音观看。Worker 每分钟领取到期任务，删除 GitHub 附件；删除失败保留记录，五分钟后重试。另分页核对该 Release，只清理 72 小时前、未登记且名称符合应用 UUID 规则的孤立 MP3。GitHub 或凭据故障可能延迟实际删除，已下载到其他设备的副本无法收回。原有静态 Whenever 试播文件不属于此次临时上传机制。

数据库新增 `album_audio_files`、仅 service_role 可执行的音乐管理和到期 RPC，以及 `album_v13_action`。创建/编辑影集时检查配乐归属和有效期，保留跨页取景、共享照片及公开链接规则。上传检查文件大小、扩展名和音频头；所有者列表和上传仍须有效成员登录。匿名播放仅允许精确 UUID 路径的 GET/HEAD，支持 iPhone 所需 Range/206/Content-Length；网关和 Worker 均不永久缓存音频。GitHub 授权不发给浏览器或媒体 CDN。

正式第十三次迁移 `202610150004_temporary_music.sql` 已执行成功，编辑器内容与本地文件一致。正式网关已独立部署，Worker 当前版本 `b7ddbc01-3697-465a-8c1e-b5b644b4de61`，调用 v13 并启用每分钟音乐清理。`GITHUB_MUSIC_TOKEN` 已通过本地忽略文件配置到 Worker secret；凭据仅限 album 的 Contents 读写，用户设置有效期至 2027-01-13，需在失效前轮换。不要提交或打印凭据。

观看页移除“查看文字与照片资料”，保留页码下拉跳转框。自动播放按作者设置的间隔从最后一个完整跨页循环回第一个，音乐持续播放；手动上一页/下一页也循环。跳转页码或切后台仍暂停播放。完整跨页按舞台实际剩余宽高缩放，不再用固定视口高度估算；短横屏压缩工具栏并保留安全区。

本地基础版本的 55 项数据库/API 测试及后续运行时回归专项通过；加入 fetch 接收者回归后共 56 项。Chrome 桌面、手机及 WebKit 共 66 项浏览器测试通过（本次未启用的 HEIC 专项 3 项由 CI 执行）。覆盖实际 MP3 字节哈希、上传进度、匿名原生播放、时钟模拟过期、清理失败重试、分页孤立附件、横竖屏、循环翻页、页码跳转，以及所有模板 PDF。PWA 预装、升级和断网恢复检查通过。72 小时到期以模拟时钟和到期记录验证，未声称真实等待 72 小时；真实 iPhone 上传与旋转仍需设备验收。

前端从 `d27c2cc` 经 [Pages #33](https://github.com/xuan9527zz/album/actions/runs/38680331552) 发布。正式 PWA 已启用新版，核对用户“势不可当”的完整 1+2 跨页、无资料展开区、保留页码跳转；未改动该影集记录或创建公开链接。正式未保存草稿中上传既有 MP3，GitHub Release 附件大小为 9,970,460 字节，界面显示 72 小时截止时间，匿名 HEAD 200、Range 206、完整 GET 200 且 SHA256 一致；原生试听 readyState 4、时间持续前进。该上传会依正常 72 小时任务清理。

正式验证发现并修复 Cloudflare 与 Node 的两处差异：全局 fetch 通过包装函数调用，避免错误的对象接收者；CDN 请求采用 Workers 支持的 manual 重定向模式，并在返回端校验 200/206/416，凭据仍不转发到 CDN。[Checks #58](https://github.com/xuan9527zz/album/actions/runs/38680517533) 已通过基础版本的完整流程；后续补丁只涉及后台运行时和专项回归，不改变 Pages #33 的前端产物。

Worker 工作流新增凭据预检。缺少 `CLOUDFLARE_API_TOKEN` secret 或 `CLOUDFLARE_ACCOUNT_ID` variable 时，部署任务明确跳过并显示“Worker 未部署”，不会把跳过当成发布成功；本次正式 Worker 使用已登录的本机 Wrangler 发布。GitHub Actions 自动发布需要独立的 Cloudflare 部署凭据，和音乐 GitHub 凭据无关。

[Worker #3](https://github.com/xuan9527zz/album/actions/runs/38680588080) 曾验证缺凭据时预检成功、deploy 明确 skipped。Cloudflare 控制台动态模块加载错误恢复后，用户亲自生成当前账户的 Workers Scripts:Edit 令牌并保存到相册仓库的 `CLOUDFLARE_API_TOKEN` 加密 Secret；`CLOUDFLARE_ACCOUNT_ID` 仓库变量已配置。令牌有效至 2027-01-13，权限覆盖当前账户的 Workers，不限单个 Worker。未读取或打印令牌值。

[Worker #4](https://github.com/xuan9527zz/album/actions/runs/38682587189) 从 `3b1a0b5` 实际发布成功：configuration 和 deploy 均 success，56 项数据库/API 测试通过，日志记录上传、部署、两个定时触发器及上述新版本。发布后通过正式网关核对健康 200、匿名照片列表 401、已上传音乐 Range 206/1024 字节且音频头正确，已有 Worker secrets 正常保留。该工作流当前由 GitHub 的 Run workflow 手动触发，并非每次推送自动部署。

最终代码的 [Checks #59](https://github.com/xuan9527zz/album/actions/runs/38681468406) 已全部通过：56 项数据库/API、包含 HEIC 的 69 项浏览器，以及 PWA 预装、升级和恢复检查。

接口依据：[GitHub Release assets](https://docs.github.com/en/rest/releases/assets?apiVersion=2026-03-10)。
