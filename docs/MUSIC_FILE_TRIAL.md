# MP3 文件配乐试验

当前包含本机原型和公开在线试播页。在线页使用合成插画及用户指定上传的一个 MP3，不读取家庭照片；正式影集的音乐配置格式及数据库没有变更。用户反馈真实 iPhone 必须手动切到兼容模式才能播放；新版将 iPhone/iPad 默认设为该原生音频路径，新版自动选择的设备端结果仍待复测。

2026-10-15 本机原型：用户样本 9,970,460 bytes、320 kb/s、约 4:09。在桌面内置浏览器显示实际 45%（约 4.5 / 10.0 MB）后达到 100%，点击播放并翻到第二页，时间继续至 0:16。该阶段没有上传原件，专项检查 7 项通过、2 项因 Windows WebKit 的 Blob 音频限制跳过。

之后用户明确要求上传 GitHub 并生成网页可嵌入的 URL。原件逐字节复制为 `apps/web/public/music/whenever.mp3`；`config/public-music.json` 记录其大小和 SHA256，私密文件扫描只允许这一个匹配文件进入公开资源。线上地址为 `https://xuan9527zz.github.io/album/music/whenever.mp3`，无需登录的试播页为 `https://xuan9527zz.github.io/album/#/music-trial`。页面可横向翻页，音频播放器保持同一个实例。

最小网页嵌入示例：

```html
<audio controls src="https://xuan9527zz.github.io/album/music/whenever.mp3"></audio>
```

`FileAudioPlayer` 在 iPhone/iPad（含使用桌面 UA 的触屏 iPad）直接使用 HTTP 音频 URL，由浏览器缓冲，不先额外下载整首歌。播放按钮在准备阶段就可点击，不以 `canplay` 作为首次点击的门槛；缓冲时显示“正在缓冲音乐…”，就绪时显示“在线播放已就绪”，不宣称完整下载 100%。缓冲时可暂停，取消待完成的 `play()` 不显示错误。

其他设备完整下载音频，按已接收字节显示进度。收到全部字节后仍等待原生播放器确认可播放，才显示 100%；未知总长度显示不确定进度。若 Blob 解码报错、准备超时或播放返回格式不支持，自动改用 HTTP 原生路径，释放之前的下载/临时地址；若原生音频也报错，保留重试与静音观看。点击播放、暂停、拖动进度、循环播放、收起面板及静音继续浏览均可操作。播放器不随翻页重新创建，当前页面中复用同一实例。关闭配乐或离开影集会取消请求、停止播放并释放临时地址。

下载采用 45 秒无数据超时、10 分钟总上限和 40 MiB 文件上限；网络失败或格式错误不会显示成功，用户可重试或静音观看。音频不加入 PWA 的永久预装清单。

开发服务仅绑定 `127.0.0.1`，指定本机样本：

```powershell
$env:ALBUM_MUSIC_TRIAL_FILE='C:\path\sample.mp3'
npm run dev:local
```

选择示例账号并创建一个包含至少两张示例照片的影集，在它的 URL 中加入 `?musicTrial=1`，例如 `http://127.0.0.1:5173/?musicTrial=1#/stories/影集ID`。指定文件通过本机开发代理按 64 KiB / 80 ms 的节奏发送，用于观察真实百分比；没有提供文件时使用仓库中的合成测试音频。此入口仅在开发演示中生效，生产构建无法开启。

`tests/fixtures/audio-tone.mp3` 为独立生成的 8 秒、330 Hz、低音量测试音。生成命令：

```text
ffmpeg -f lavfi -i sine=frequency=330:duration=8 -af volume=0.05 -codec:a libmp3lame -b:a 96k -ar 44100 tests/fixtures/audio-tone.mp3
```

桌面/手机尺寸 Chrome 验证完整下载、点击播放、翻页维持同一个音频元素、断网继续播放、取消和重试。Windows 自带的 Playwright WebKit 能播放同一 MP3 的 HTTP URL，但拒绝其 Blob URL；本机原型的两项完整 Blob 播放测试明确跳过，错误和静音继续的测试仍执行。新版三种浏览器的专项检查 22 项通过、2 项上述跳过，覆盖 iPhone/iPad 识别、准备期间播放按钮可用、Blob 错误自动切换、实际播放/暂停及翻页保留、关闭/重新开启，以及原生同一 URL 从服务器故障恢复后重试实际播放。重试重建音频元素，使先前失败的原生加载重新开始，翻页仍保留当前实例。Windows WebKit 原生媒体请求不经过 Playwright 路由，无效文件/持续 503 场景由开发服务器实际返回；能拦截媒体的浏览器另外验证播放前等待超过 15 秒不会误判失败、缓冲时暂停不报错、原生请求不额外走 fetch。检查不依赖浏览器将原生请求分类为 media 或 other。该模拟不能代替真实 Safari/iPhone 验收。

后续接入工作台音乐配置前，需要验证真实 iPhone 的缓存音频播放，并为音乐资源增加选择、上传/删除和引用机制。当前公开页只演示这一首歌，不修改已保存影集的配乐。

线上验证：2026-10-15 [Pages #27](https://github.com/xuan9527zz/album/actions/runs/38609640817) 从 `650cfea` 发布成功。公开 MP3 返回 200、`audio/mp3`、9,970,460 bytes，SHA256 与原件相同；范围请求返回 206 及正确的 1,024 bytes。当前桌面网络整文件读取约 1.1 秒，不代表手机或其他网络耗时。正式试播页已实际点击 PWA 更新、达到 100%、点击播放并切至第二页，时间继续至 0:06；测试结束后暂停。截图保存在本机 `.local/hosted-mp3-production.jpg`，不提交到 Git。真实 iPhone 仍待用户复测。

[Checks #48](https://github.com/xuan9527zz/album/actions/runs/38609605821) 完整通过：49 项数据库/API、51 项 Chrome/手机 Chrome/Linux WebKit 浏览器，以及 PWA 预存、更新和恢复；Linux WebKit 的 Blob 播放测试通过，没有跳过。
