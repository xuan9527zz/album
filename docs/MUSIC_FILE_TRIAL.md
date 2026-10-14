# MP3 配乐验证与后续上线

当前功能和使用方式见 [影集文件配乐](BGM_RELEASE.md)。工作台已接入注册的 GitHub Pages MP3，所有浏览器使用原生 HTTP 音频；底部内嵌静音与曲名，点击播放影集同步启动音乐，翻页间隔可设置。之前的整文件 Blob 下载、100% 提示和浮动音乐面板已移除，不再使用。

用户指定文件 `music/whenever.mp3` 为 9,970,460 bytes，约 4:09、320 kb/s，SHA256 `fe0389cc5f291c1f74d8b6c6abdf48345cb530171944fad17732fd83b7301d56`。原件未经转码，用户明确要求公开上传；本地私密文件扫描通过 `config/public-music.json` 核对该唯一路径、大小和哈希。公开地址 `https://xuan9527zz.github.io/album/music/whenever.mp3` 已核对 200、相同字节/SHA256 及正确的 206 范围读取。

历史验证：最初本机原型下载完整 MP3 并交给 Blob 音频播放器，桌面能播放并保持翻页；Windows WebKit 不能解码 Blob，改用 HTTP 可以播放。公开试播由 [Pages #27](https://github.com/xuan9527zz/album/actions/runs/38609640817) 发布。用户真实 iPhone 反馈必须手动选择兼容模式；[Pages #29](https://github.com/xuan9527zz/album/actions/runs/38614031132) 自动选择原生播放后，用户明确确认 iPhone 可以直接点播放发声。[Checks #51](https://github.com/xuan9527zz/album/actions/runs/38613942429) 的 49 项数据库/API、63 项浏览器及 PWA 检查通过。

开发演示仅绑定 `127.0.0.1`。`ALBUM_MUSIC_TRIAL_FILE` 可指定本机样本，未指定时使用独立生成的 8 秒、330 Hz、低音量测试 MP3。`?musicTrial=1`、`stall`、`failure`、`invalid` 仅在本地演示中启用，错误由开发服务器真实返回，以覆盖 WebKit 不经 Playwright 路由的原生媒体栈。生产不会开放此本机文件接口。
