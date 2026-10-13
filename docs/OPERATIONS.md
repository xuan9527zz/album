# 维护与恢复

## 账号

`npm run account -- create` 交互输入家庭成员邮箱、昵称和密码，要求邮箱归属确认。`npm run account -- disable` 以账号 UUID 停用；已有 JWT 对新业务操作会因数据库名单检查而失效。`npm run account -- activate` 补录或恢复，但触发器严格限制四个启用成员。`npm run account -- reset-password` 交互更新指定 UUID 密码，不通过公开页面发重置邮件。后台密钥保存在 Worker secrets 或 Git 忽略的私密配置中。

家人自己设置密码时，管理员运行 `npm run invite -- 家人邮箱 昵称`。脚本用 Supabase Auth 生成一次性邀请链接、建立启用的成员资料，并把链接保存在 Git 忽略的 `.local/invites/`，不会把令牌打印到终端或自动发送邮件。管理员只把该链接发给对应邮箱；收件人在链接有效期内打开，设置至少 12 位密码后进入自己的相册。发送后删除本地链接文件。Supabase 默认 SMTP 只投递到项目团队邮箱；向家庭成员邮箱发送时应配置自有 SMTP，或通过管理员本人已登录的邮箱单独发送。邀请链接属于登录凭据，不能发到公开群、仓库或聊天记录。

## 容量与清理

照片移入“最近删除”后保留 30 天，期间本人可恢复或主动永久删除，文件仍计入容量。已在共享相册的照片会立即对其他成员隐藏；恢复后回到删除前的共享状态。30 天到期后，Worker 定时将其转为待清理，每六小时尝试物理删除。`npm run maintenance -- cleanup` 默认为 dry-run，会报告到期数量（`expired_due`）与其他待清理数量；`npm run maintenance -- cleanup --apply` 执行清理。清理等待所有已发 PUT 到期再处理已登记对象，只释放实际删除成功的用量。对象存储失败时保留数据库记录与计量，下次重试。`npm run maintenance -- reconcile` 分页读取 R2 清单，对比数据库：输出对象数、字节、孤立对象数量和缺失正式对象数量，但不会自动删孤立文件或擅自改账本。先排查差异，再决定后续修复；不要清空数据库解决账本问题。

首次预算为 8,000,000,000 字节，提醒 6,000,000,000 字节，值在数据库 `storage_budget` 单例行。调整需由管理员在确认供应商额度后修改，避免将它误当账单上限。并发预留由数据库单行事务锁处理。

## 原件和记录备份

`npm run backup:records` 导出所有账号、照片、资产、上传事务和预算记录到 Git 忽略的 `.local/backups/records-*.json`。`npm run backup:objects` 流式下载已提交的 R2 对象到 `.local/backups/objects-*/private/...`，逐个比较记录中的 SHA256，并写入同目录的 `checksums.jsonl`。备份可能含私人照片、GPS、对象 key；将其加密复制到独立介质，不放 Git、公共共享目录或日志。云端单份存储不能替代独立备份。`npm run verify:original` 可将手动导出的源文件与本人云端下载原件逐字节比对 SHA256。

## 故障与更新

- 原件已保存、预览失败：在“全部”打开照片，重新选择原件或 JPEG 生成浏览图片。旧预览文件只在到期清理成功后释放空间。
- 上传中断：保持同一账号，在“上传”页重新选择原文件。后台核对 SHA256 并完成未提交资产。若已过 24 小时会话过期，需重新发起上传；已保存原件继续可下载。
- Supabase 暂停、认证失败、R2 故障：先确认服务状态和私密配置；前端会显示连接失败，不会代替为本地照片。恢复后先用合成文件运行云端冒烟测试，再让家人继续上传。
- GitHub Pages 子路径改变：同步修改 `VITE_BASE_PATH`、manifest、Service Worker scope、Supabase 站点 URL、Worker origin 白名单和 R2 CORS。
- Worker 更新：先运行本地测试和 dry-run，再部署。密钥轮换时在 Cloudflare 更新 Worker secrets 与桶范围密钥；不把密钥放在 GitHub 环境变量的公开版本，也不在日志输出 JWT、密码、GPS 或签名 URL。
- Live Photo：普通相册选择可能只有静态图；在“文件”App 导出静态原件和配套 MOV/MP4，再手动组合。组合状态是未验证，不等同于系统相册还原。
- Safari/WebKit 下载：先点“准备下载”，待文件从私有存储取回后再点“下载原件”或“下载配套视频”。准备过程需要足够的设备空闲内存，下载后可在浏览器下载列表或“文件”App 中查找。

在 iPhone 上使用 Safari 分享 → 添加到主屏幕。PWA 页面外壳可离线打开，照片、上传、下载需要联网。真实 iOS 行为在设备验收前不能保证。
