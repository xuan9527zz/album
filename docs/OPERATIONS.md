# 维护与恢复

## 账号

`npm run account -- create` 交互输入家庭成员邮箱、昵称和密码，要求邮箱归属确认。`npm run account -- disable` 以账号 UUID 停用；已有 JWT 对新业务操作会因数据库名单检查而失效。`npm run account -- activate` 补录或恢复，但触发器严格限制四个启用成员。`npm run account -- reset-password` 交互更新指定 UUID 密码，不通过公开页面发重置邮件。后台密钥保存在 Worker secrets 或 Git 忽略的私密配置中。

## 容量与清理

`npm run maintenance -- cleanup` 默认为 dry-run，仅输出待处理照片、会话与对象的数量；确认后 `npm run maintenance -- cleanup --apply`。Worker 每六小时也尝试同一清理。清理等待所有已发 PUT 到期再处理已登记对象，只释放实际删除成功的用量。对象存储失败时保留数据库记录与计量，下次重试。`npm run maintenance -- reconcile` 分页读取 R2 清单，对比数据库：输出对象数、字节、孤立对象数量和缺失正式对象数量，但不会自动删孤立文件或擅自改账本。先排查差异，再决定后续修复；不要清空数据库解决账本问题。

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

在 iPhone 上使用 Safari 分享 → 添加到主屏幕。PWA 页面外壳可离线打开，照片、上传、下载需要联网。真实 iOS 行为在设备验收前不能保证。
