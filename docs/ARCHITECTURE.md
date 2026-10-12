# 架构与关键决定

## 数据与边界

浏览器从 Supabase Auth 取得 access token。Worker 使用 Supabase `getClaims` 验证签名、发行者、受众和有效期，再由数据库 `album_action` 检查启用名单及每条照片归属。Worker 持有后台密钥，因此每个业务 RPC 仍明确检查 `owner_id`；前端无法写入数据库表。`authenticated` 只可在 RLS 限制下读取本人的 `profiles`、`photos` 和 `photo_assets`。`anon` 读不到业务数据。`upload_sessions`、`upload_items`、`storage_budget` 都只供 service role 使用。

初始数据库迁移为 `202610120001_album.sql`。四人限制在数据库触发器中执行。`photos` 按本人、拍摄日期和上传时间稳定分页；缺拍摄日期才使用上传日期排序。EXIF 本地时间和 UTC 偏移分开存储，不在未知时区时推算 UTC。上传时读取的原始元数据保存在 `source_metadata`，显示信息可编辑但不改变文件。

## 文件链路

1. 客户端对原文件分块计算 MD5 和 SHA256；后端在同一事务中核验名单、幂等键与项目容量，预留所需字节并生成随机对象 key。
2. R2 S3 签名只允许短时 `PUT` 指定 key，绑定 Content-Type、Content-MD5、Content-Length、`If-None-Match: *`。浏览器无法手动设置 Content-Length，由文件 Blob 请求自动产生。重放旧 PUT 对已有对象应返回 412，不能覆盖已提交原件。
3. 上传后 Worker 使用 HEAD 核验大小、类型和单次 PUT 的 MD5 ETag，再用小范围 GET 检查内容签名。只有完成核验，数据库事务才把预留用量转为已保存用量并登记资产。
4. 浏览器另行生成预览和缩略图，分别上传。HEIC 解码失败时原件仍可下载，详情提供预览补传。补传新的浏览版本时旧版本保留计费，直到到期清理确认旧对象已删。

该实现使用 R2 文档列出的有条件 `PutObject`，取代计划书的 staging + 复制。它依赖真实 R2 对 `If-None-Match` 与 Content-MD5 的行为；部署前必须运行云端冒烟测试并观察重放返回 412 和下载 SHA256 一致。与 R2 交互目前没有真实账户验收，不可把本地对象模拟结果当作云端保证。[R2 S3 兼容说明](https://developers.cloudflare.com/r2/api/s3/api/)和[预签名 URL 说明](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)是核验依据。

签名有效期和已批准 key 记录于 `upload_items`。取消或删除立即停止新链接，但等待所有旧 PUT 授权过期加 60 秒后才清理对象、释放预算。清理只触碰数据库已登记的 key，可重试，且先删除 R2 再更新账本。若数据库更新失败，下次重试再次删除同 key 后收敛。项目默认预算 8 GB、提醒 6 GB；这是应用限额，不是供应商账单硬上限。预留、已保存与旧浏览版本均计入项目容量。

Worker 给缩略图和预览图签发短时 GET；原件下载需独立请求。签名 URL 不写入数据库或日志。R2 对象通过 `Cache-Control: no-store` 保存，PWA Service Worker 只缓存同域、无查询参数、白名单里的公开静态资源。浏览器和 R2 的真实缓存行为仍需云端验收。

## Live 与恢复

相册选择器不能保证提供 Live Photo 配套视频。导入原件文件时，用户明确把静态图与 MOV/MP4 配在一起；也可在已有静态照片详情补视频。没有可靠元数据证明时只标记 `paired_unverified`，第一版不播放或宣称可还原 iOS 原生 Live Photo。

未完成上传在当前账号的 `sessionStorage` 只记会话 ID，不存照片二进制；重新选文件后核对 SHA256 与后台批准项，完成接口重复调用不重复扣量。已存原件但预览失败的照片仍出现在“全部”。刷新登录会话失败时显示错误，不回退到本地演示。退出时中断本页请求并清除会话记录；已经发出的短时文件链接会到期，不声称立即撤销。

## 已知需云端确认的边界

- R2 签名中的 Content-Length、Content-MD5、If-None-Match 与 CORS 的实际组合行为。
- iPhone Safari 相册选择的格式转换、HEIC 解码、文件名、下载到“文件”App 的结果。
- 四个真实用户和中国大陆直连的首屏、预览、上传速度；云项目空闲、免费额度和费用以当时平台规则为准。
