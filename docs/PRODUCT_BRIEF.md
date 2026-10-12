# 家庭精选相册：Codex 执行计划 v1.0

日期：2026-10-12
交付目标：可自行维护、低成本运行的四人私密相册网站，支持 iPhone PWA。
本文定位：完整开发任务书和验收依据；不是已开发、已部署或已实测的完成报告。
优先级：P0 必须完成；P1 第一版手机体验；P2 后续扩展。

---

## 0. 给执行 Codex 的任务指令

请把本文作为项目需求和执行计划，按阶段实际完成代码、数据库迁移、配置模板、测试和部署文档，而不只输出设计建议。

基础方案已经由用户确定：
- 自己开发网站，源码放 GitHub。
- 页面初步使用 GitHub Pages；可保留 Cloudflare 静态托管兼容性。
- Supabase Auth 管理账号，Supabase PostgreSQL 保存照片记录。
- Cloudflare Workers 提供文件授权与后台接口。
- Cloudflare R2 私有储存保存原件和派生图片。
- 不需要家庭 NAS 或常开电脑。

执行规则：
1. 开始先检查工作目录、已有仓库与适用的 AGENTS.md；保留已有有效工作。不修改用户之前的另一个网站，除非明确指定。
2. 以本文已确定需求为准。技术细节可自主选择并记录，不反复向用户确认已定事项。
3. 若缺少云服务配置，继续完成独立代码、迁移、测试、配置模板和本地演示；集中列出最终需要用户配置的内容。不能伪称已连接真实云服务。
4. 本地模拟必须有明确标识。最终生产环境不能静默退回假登录或浏览器本地照片库。
5. 默认中文界面，手机优先，照片为主，设计克制。不要把技术平台名称塞进家庭成员的正常使用流程。
6. 不自动购买套餐、域名或启用付费图像处理。云服务开通与费用选择由项目所有者操作。
7. 没有项目 ID、账户绑定或部署权限时，不虚构成功链接；交付可部署工程与准确操作文档。
8. 未经用户明确指定，不复用旧网站的账号、数据库或生产环境。先采用独立相册项目，以免影响已有网站。
9. 不把密码、云密钥、真实家庭照片、GPS测试素材、带授权参数的链接写进 Git 或日志。
10. 对开发中变更保留简短记录；最终说明完成项、实际运行过的检查、仍待验证项和部署所需动作。

**成功标准：四个真实账号可独立上传、查看、精选、编辑和下载自己的原件；其他账号无法读取或操作；iPhone 主屏幕 PWA 可用；原件完整性和真实网络表现有测试记录。**

## 1. 产品需求

### 1.1 已确定

| 编号 | 需求 | 优先级 |
| --- | --- | --- |
| R01 | 四个固定家庭账号，默认各自照片私密 | P0 |
| R02 | 每人约 500 张，共约 2,000 张，按此规模设计；不是强制张数上限 | P0 |
| R03 | 保存原始上传文件，支持下载；单独生成缩略图与预览图 | P0 |
| R04 | 第一版以静态照片浏览为主 | P0 |
| R05 | Live Photo 的静态原件和配套视频可以成组保存，第一版不要求播放 | P0 |
| R06 | 上传后选择是否精选；首页精选，另有全部照片入口 | P0 |
| R07 | 自动尝试读取拍摄日期与位置；可手动补充、编辑 | P0 |
| R08 | 支持 JPEG、PNG、HEIC/HEIF 原件；浏览使用兼容预览文件 | P0 |
| R09 | iPhone Safari 和添加到主屏幕的 PWA 可用 | P1 |
| R10 | 多文件上传进度、失败重试、原件保留与容量提醒 | P1 |
| R11 | 以大陆直连为使用目标，实测后判断是否满足速度要求 | P0 验证 |
| R12 | 尽量使用免费额度，容量超限前阻止新增上传；不承诺绝对零费用 | P0 |

### 1.2 第一版暂缓

不做家庭共享、公开分享、地图、付费地理编码、人脸识别、AI 搜索、常规视频浏览、Live Photo 播放、自动扫描整部手机相册、原生 iOS App、完整照片离线库、回收站、复杂后台管理界面。

普通视频不作为独立条目上传；仅接受作为 Live Photo 配套素材的视频。Live Photo 的“两个文件已保存”不等于已验证可在系统相册中还原。

### 1.3 默认产品决定

- 固定账号使用邮箱 + 密码；昵称用于界面显示。
- 项目所有者在 Supabase 控制台或可信管理脚本中配置四个用户，不开放公众注册或匿名登录。
- 首页为当前用户的精选，底部导航：精选 / 全部 / 上传 / 我的。
- 全部照片按拍摄日期倒序、按月分组；拍摄日期缺失时使用上传日期，并标注“上传于”。
- 地点先显示文字；GPS 只保存与显示，不调用付费地图服务。
- 没有 GPS 不申请当前手机定位来填充历史拍摄地点。
- 不要求每张照片上传前必填日期和地点。
- 删除需确认，第一版不设回收站。原件仍应有用户独立备份。

## 2. 总体架构

### 2.1 技术栈建议

| 层 | 默认选择 | 要求 |
| --- | --- | --- |
| 前端 | React + TypeScript + Vite | 输出纯静态 dist；可部署 GitHub Pages |
| 页面路由 | 支持 Pages 子路径的 hash 路由，或等价可靠方案 | 刷新、详情链接、PWA启动不出现404 |
| 认证 | supabase-js + Supabase Auth | 使用平台密码认证、会话刷新；不自建密码哈希表 |
| 数据库 | Supabase PostgreSQL | SQL 迁移、RLS、索引、约束、必要事务函数 |
| Worker | TypeScript，轻量路由 | 接口验证、业务权限、R2签名与上传完成核验 |
| R2签名 | 验证兼容性的 SigV4 库，如 aws4fetch 或兼容 SDK | 密钥只在后台；S3 endpoint region 为 auto |
| 元数据 | 浏览器兼容的 EXIF 解析库 | 在压缩之前解析；无信息时不编造 |
| 图片处理 | 浏览器解码、Canvas/兼容解码库，重任务放 Web Worker | HEIC实际兼容性需验证；不得重写原件 |
| 测试 | 与工程适配的单元、API、数据库集成及浏览器测试工具 | 只报告实际执行结果 |

执行前核对所选库当前官方文档、许可证、浏览器兼容性及 Worker 运行限制，锁定可复现依赖版本。本文不指定未经验证的版本号。

### 2.2 请求分工

~~~mermaid
flowchart TD
  A["iPhone PWA"] --> B["Supabase Auth"]
  A --> C["Supabase 照片记录"]
  A --> D["Workers API"]
  D --> C
  D --> E["R2 私有文件"]
~~~

- 前端向 Supabase Auth 登录。
- 前端可使用用户令牌读取受 RLS 限制的本人记录。
- 所有业务写入走 Workers，避免前端伪造储存用量、文件状态或 owner_id。
- Workers 独立验证令牌及四人名单，不信任前端传入的用户身份。
- 文件主要通过短时授权直传/直读 R2，避免把所有图片流量默认经 Worker 中转。
- 若后台使用 Supabase 管理密钥，它会绕过 RLS，因此每个业务操作都要显式按已验证身份检查成员资格和归属。RLS不能代替这一步。

## 3. 项目目录与交付工程

建议单仓库，使用工作区或其他简单多目录方案：

~~~text
apps/web/                  前端、页面、PWA
apps/api/                  Workers、认证、文件授权、业务接口
packages/shared/           请求/响应类型、校验规则、状态定义
supabase/migrations/       有序SQL迁移
supabase/tests/            权限、约束、事务测试
scripts/                   账号初始化、用量核对、清理、部署辅助
tests/fixtures/            合成或明确获准的测试文件
tests/e2e/                 浏览器流程测试
docs/ARCHITECTURE.md        架构与关键决定
docs/DEPLOYMENT.md          从零部署、更新与回滚
docs/OPERATIONS.md         恢复、用量、清理、账号操作
docs/TEST_REPORT.md         已测结果、设备网络与未测项目
docs/HANDOFF.md             给下一个维护者的交接
.github/workflows/         检查与部署工作流
.env.example               仅公共配置占位
.gitignore                 密钥、开发状态、真实素材、构建缓存
README.md                  本地启动、脚本、功能和当前完成状态
~~~

每个应用提供实际对应的示例配置。Workers 开发密钥文件必须忽略；测试用户密码通过安全的本地配置或交互输入，不写进仓库。

配置缺失时 UI 显示明确的配置错误或单独演示模式，不能伪装成生产登录成功。

## 4. 页面与交互任务

### 4.1 登录

- 邮箱与密码，显示通用失败提示，不暴露账号是否存在。
- 恢复已有 Supabase 会话，登录后再加载个人数据，避免上一账号照片闪现。
- 认证成功仍须验证 profiles 中的启用名单；非家庭用户显示无访问权限。
- 无公众注册、匿名登录、社交登录按钮。
- 第一版重置密码由项目所有者在控制台处理，说明写入运维文档；不依赖未配置邮件服务的“忘记密码”按钮。
- 合理处理刷新令牌失败、会话过期和网络不可用。

### 4.2 精选和全部

- 精选空状态引导到全部照片或上传。
- 每次查询建议24条，按实际布局调整；索引与稳定游标分页避免重复和遗漏。
- 先显示缩略图；首屏图立即加载，其余延迟加载。
- 缩略图失败可重取授权并重试，不把鉴权错误误判为照片不存在。
- 全部照片按月份分组；同日期用uploaded_at/id作为稳定排序次键。
- 原件已保存但预览未完成时仍显示可理解的待处理条目与重试入口，不能完全隐藏该记录。
- 不自动加载原图或视频。

### 4.3 照片详情

- 清晰预览，可放大；显示拍摄时间、地点、精选状态。
- 支持编辑显示用日期和地点、标记精选、下载原件、删除。
- 原件尺寸/格式信息可放详情次级位置，正常流程不展示云平台术语。
- Live素材显示“仅静态部分”“配套视频已保存”或已验证的配对状态；不把任意MOV附件标为已认证Live原件。
- 尚无拍摄信息时显示缺失提示，不显示上传时间为拍摄时间。
- 下载使用原始文件名，并处理 iOS 下载/文件保存的真实行为。

### 4.4 上传

- 两个明确入口：“从相册选择”和“导入原件文件/Live素材”。以实际iOS行为测试结果设计提示。
- 支持多张，显示每项队列、上传和处理状态；默认同时上传2项，低内存设备可降为1项。
- 文件数量、大小和类型在前端及后台都校验。
- 原件上传优先；浏览版本失败不能删除已经保存好的原件。
- 建议初始单静态原件上限64MiB，Live配套视频128MiB；作为可配置技术保护值，不是产品收费限制。
- 预览图长边约2048px；缩略图长边约480–640px。根据实际照片和屏幕验证清晰度与体积。
- 预览压缩只能用于派生文件；上传原件不能经过Canvas或重新编码。
- 对HEIC不能生成预览的情况，先保存原件并给出补生成/补传预览路径，不能假装已支持完整浏览。
- 不承诺关闭PWA、锁屏或iOS挂起后仍持续上传；回来后核验后台状态再继续。
- 不把全部原件长期缓存到浏览器作为云端成功的替代。

### 4.5 我的

- 昵称、本人照片数、本人文件占用、家庭项目总容量提醒。
- 家庭总容量只返回总数值，不泄露其他成员的照片详情。
- 安装说明、退出登录。
- 退出取消请求、清除内存查询和未完成队列、私密缓存；用户A退出后B登录不得看到A的数据。

## 5. 数据库设计与SQL任务

以下字段是开发基线。Codex可按实现调整，但需迁移和解释，不改变业务含义。

### 5.1 profiles

| 字段 | 类型/约束 | 说明 |
| --- | --- | --- |
| user_id | uuid PK，关联auth.users | 账号身份 |
| display_name | text，有长度限制 | 昵称 |
| is_active | boolean，管理端控制 | 四人启用名单 |
| created_at | timestamptz | 创建时间 |

不要让普通用户通过update自己的profile启用账号或改变成员名单。最多允许通过受控接口改昵称，第一版可不开放。

### 5.2 photos

| 字段 | 类型/约束 | 说明 |
| --- | --- | --- |
| id | uuid PK | 照片条目ID |
| owner_id | uuid NOT NULL | 归属，后台赋值且不可普通修改 |
| captured_local | timestamp without time zone，可空 | 照片原始当地拍摄时间 |
| captured_utc | timestamptz，可空 | 只有已知可靠偏移时才推算 |
| capture_offset_minutes | smallint，可空 | 已知UTC偏移 |
| date_source | enum/check | exif / manual / unknown |
| sort_date | date | 拍摄日期，缺失才使用上传显示日期 |
| location_label | text，可空、长度限制 | 用户看到的地点文字 |
| latitude / longitude | double precision，可空 | 原始GPS，范围校验 |
| location_source | enum/check | exif / manual / unknown |
| is_featured | boolean default false | 精选 |
| preview_status | enum/check | pending / ready / failed |
| original_status | enum/check | pending / saved / failed |
| live_status | enum/check | unknown / static_only / paired_unverified / paired_verified |
| lifecycle_status | enum/check | uploading / active / failed / deleting |
| uploaded_at / updated_at | timestamptz | 上传与编辑时间 |

关键要求：
- 有EXIF当地时间却没有时区，保存当地时间，不强行假定为UTC或北京时间。
- 保留EXIF读取值与用户编辑值的来源；用户修改显示信息不改原件。
- GPS未知留空，不能用0,0代表缺失。
- 新记录由后台生成；前端不能传owner_id覆盖。
- 推荐索引owner_id + is_featured + sort_date + id；owner_id + lifecycle_status；uploaded_at。
- 保证(id, owner_id)唯一，供资产表建立组合外键。

### 5.3 photo_assets

| 字段 | 类型/约束 | 说明 |
| --- | --- | --- |
| id | uuid PK | 文件资产ID |
| photo_id / owner_id | 组合FK到photos | 防止跨账号关联 |
| role | enum/check | original_image / live_video / preview / thumbnail |
| object_key | text UNIQUE | 正式R2文件路径，不存长期授权URL |
| original_filename | text，有长度限制 | 安全显示与下载名 |
| mime_type | text | 已校验类型 |
| size_bytes | bigint，非负 | 实际文件大小 |
| width / height | integer，可空 | 静态图尺寸 |
| checksum_algorithm / checksum_value | text，可空 | 客户端原始校验值 |
| checksum_verification | enum/check | client_reported / transport_verified / download_verified |
| etag | text，可空 | 对象版本/校验辅助，不能一概当SHA256 |
| provenance | enum/check | browser_selected / file_imported |
| source_original_verified | boolean default false | 是否真实核验与源文件一致 |
| pairing_method | text，可空 | metadata / manual等 |
| created_at | timestamptz | 创建时间 |

每条照片每类有效资产通常一份，使用约束或版本字段防止重复。预览重生成允许新key替换指针，旧文件在成功后清理；原件不覆盖。

### 5.4 upload_sessions

保存后台上传事务、重试和容量预留，不暴露为普通用户可写表：
- id、owner_id、photo_id、idempotency_key；
- 请求摘要，已批准角色/大小/类型/校验值；
- staging key、final key、期望ETag、已发签名最晚到期时间；
- reserved_bytes、实际已保存字节；
- state、created_at、expires_at、错误代码和清理状态。

如多资产JSON不利于约束，可拆成upload_session_assets，但不要为第一版引入复杂队列平台。

### 5.5 storage_budget

单项目容量账本：
- committed_bytes、reserved_bytes、budget_bytes、warning_bytes、last_reconciled_at。
- 预留包括并发上传和staging/final临时双份的最大占用。
- 不允许前端修改。
- 由数据库事务锁或等价原子RPC检查和预留，不能只靠Worker进程内锁。
- 定期对R2实际占用核对；账本不是官方账单的硬上限。

### 5.6 RLS、grants与事务函数

明确实现并测试：
1. anon不能读取任何业务数据。
2. authenticated只SELECT本人且处于启用名单的photos/photo_assets/profiles。
3. 第一版业务写入统一走后台；撤销不必要的authenticated INSERT/UPDATE/DELETE权限。
4. 普通账号不能读写upload_sessions和storage_budget。
5. 成员校验不要写成对profiles自身的无限递归policy。若用security definer helper，固定search_path，仅暴露当前调用者的成员判断。
6. 对预算预留、上传完成、删除完成使用原子数据库操作；避免数据库记录已更新但容量账本没更新。
7. service-only RPC必须撤销PUBLIC/anon/authenticated执行权限；所有输入来自已验证后台。
8. SQL迁移可重复部署到新项目；已应用迁移不改写，新增迁移修复。
9. 不在前端用管理密钥，不能声称“启用RLS就足够保护使用管理密钥的Worker”。

## 6. 原件上传、完整性和Live素材

### 6.1 文件识别

- 综合扩展名、实际内容签名、容器信息判断；不能仅信任前端Content-Type。
- image/jpeg、image/png、image/heic、image/heif为首批静态类型。
- video/quicktime、video/mp4仅用于附着Live素材；类型错误拒绝。
- MIME校验不能修改原件。异常文件可拒绝或保留隔离待确认，不能公开提供。
- 若需要后台读取文件头，使用小范围读取，不把128MiB文件完整加载进Worker内存。

### 6.2 原件保护与staging提交

预签名PUT可以在有效期内重复使用。不能让它一直指向已提交原件，否则原件可能被重写。默认采用：
1. 后台创建独立staging key和最终不可变key，路径只由后台生成。
2. 客户端的短时PUT仅能写staging key。
3. 上传完成后，后台HEAD核验大小、类型等，必要时范围读取文件头。
4. 使用已验证的ETag等版本条件，把该对象复制/提交到最终key；核验最终对象。
5. 数据库事务登记正式资产和实际用量。之后任何新PUT授权都不能指向该最终原件key。
6. staging清理需考虑签名到期后才能彻底避免链接重放重建；保留临时容量预留至到期与清理完成。
7. 删除数据库或完成状态不是撤销已发签名。记录所有有效期，清理工作处理过期后重新出现的staging文件。
8. R2 S3支持哪些复制/条件头以当前官方API与集成测试为准。不假定任意AWS操作都兼容。
9. 若采用经过测试的等价“不可覆盖单次写入”方案，可替换staging设计，但必须通过重复PUT不能改已提交原件的验收。

复制操作需采用对象储存服务器端方式，不通过Worker加载和重传整张原图。R2/数据库无法跨平台原子提交，因此设计重试可恢复的状态机，不能假定一次操作全部成功。

### 6.3 校验值

- 客户端在原文件上计算校验值；大文件分块计算，避免主线程卡顿和多个大文件同时占内存。
- 优先验证Content-MD5或当前R2真实支持的校验上传机制；签名和CORS允许所用头。
- 记录客户端校验值、传输验证和实际下载校验是不同层级。
- 仅从客户端提供的metadata读回相同值，不算服务端验证。
- 不假定ETag恒等于SHA256，也不把multipart ETag当整文件MD5。
- 必须用若干下载回来的原件重新计算SHA256，证明上传—保存—下载链路字节一致。
- 篡改正文但保留已批准的校验头，应在上传或完成核验阶段失败。
- 对“相机原件未变化”的证明，还需与用户导出的源文件比较；浏览器收到的文件一致不证明系统选择器未转换。

### 6.4 Live Photo导入

- 普通相册选择不能保证同时取得静态图和视频。
- 提供“导入Live原件”入口，允许一次选择静态图和配套MOV/MP4，并由用户确认分组。
- 优先读取可靠content identifier等元数据配对；同名文件最多作为候选，不足以自动认定。
- 不能验证的手动组合标为paired_unverified；仅保存静态图标为static_only。
- 一个逻辑照片计为一张，但其全部资产都计入容量。
- 原件静态图与视频都支持分别下载；第一版不承诺一键导回iOS并恢复Live效果。

### 6.5 日期地点与预览

- 先解析原件，再生成浏览版本。
- EXIF旋转、前置镜像、色彩和宽高在预览生成时处理；检查竖图不会横着显示。
- 全景、大尺寸图、HEIC、截图和无EXIF图都有可理解的结果。
- 地点展示允许用户填“深圳·莲花山”等文字；GPS只有坐标时不编造具体地址。
- 用户手动补日期默认只补当地时间；偏移不确定可留空。
- 更改精选、地点与日期不重新上传原件。
- 图像转换失败不导致原件丢失，也不能把低清预览当作原件保存。

## 7. API约定

### 7.1 通用约定

- 除健康检查外，业务接口要求Supabase access token。
- 核验签名、发行方、受众、有效期，再检查active家庭成员。
- 不仅decode JWT，不使用未经验证的getSession用户对象作为服务端身份依据。
- 命中他人照片或资产统一返回404，避免泄露存在性。
- JSON响应不包含云密钥；签名响应和私密数据响应使用Cache-Control: no-store。
- 限定Allowed Origins；开发localhost与正式origin分别配置。
- CORS不是鉴权，curl或改请求仍必须受身份和归属检查。
- 对写入设置频率保护、并发限制与幂等。
- 最小错误结构：error.code、error.message、request_id。日志不记录token、密码、完整签名URL、GPS或照片正文。

### 7.2 接口清单

| 方法/路径 | 输入或用途 | 必须检查 |
| --- | --- | --- |
| GET /health | 服务健康，不返回密钥 | 不泄露配置 |
| GET /v1/me | 昵称、个人数量与用量 | 成员启用 |
| GET /v1/usage | 个人用量、家庭总量和预算状态 | 不返回其他用户细节 |
| POST /v1/uploads/init | 资产角色、大小、类型、校验值、拍摄信息；Idempotency-Key | 名单、类型、大小、预算原子预留 |
| POST /v1/uploads/:id/refresh | 获取尚可重试资产的上传授权 | 当前owner、状态、有效期、额度 |
| POST /v1/uploads/:id/assets/:assetId/complete | 通知单资产已传；后台实际核验 | owner、HEAD、内容/校验、不可变提交 |
| GET /v1/uploads/:id | 恢复上传状态 | owner |
| POST /v1/uploads/:id/cancel | 取消未提交部分 | owner、保留已完成原件、延期清理 |
| GET /v1/photos | 分页、精选过滤；可选统一由后台读取 | owner、名单、分页限制 |
| GET /v1/photos/:id | 详情，可选统一后台读取 | owner |
| PATCH /v1/photos/:id | 精选、显示日期、地点 | 只允许指定字段，禁改owner/key/bytes/status |
| POST /v1/photos/:id/assets/init | 补Live视频、缩略图或预览 | owner、角色、版本、预算 |
| POST /v1/assets/read-urls | 小批量asset ID、用途 | 每项owner；上限如24项 |
| POST /v1/photos/:id/original-download | 请求原件下载链接 | owner、指定原件资产、安全文件名 |
| DELETE /v1/photos/:id | 完整删除或进入可重试删除状态 | owner、数据库/R2/用量一致性 |

列表可直接查询Supabase，也可走Worker，但必须选定一个主要实现，避免维护两套排序与分页逻辑。后台保留归属检查，不依赖列表在前端是否可见。

### 7.3 授权URL

- 默认上传签名约5–10分钟，读取约5分钟；测试实际上传耗时再调整。
- R2 S3预签名链接使用S3 API域名，不假定它能直接改成自定义域名。
- 签名绑定操作、指定key、Content-Type及所选校验头。
- 不允许客户端指定任意bucket/key，也不签名客户端任意URL。
- 链接过期时通过已有登录会话重取；浏览器CORS错误需考虑过期签名的表现，不能无限重试。
- 普通退出登录不会瞬间撤销已经发出的短时文件链接；用短有效期控制窗口，别声称立即撤销。
- 最终私密对象的Cache-Control建议no-store；不通过公共CDN绕过鉴权。
- 不用r2.dev公开开发链接作为家庭私密照片生产路径。

## 8. 重试、删除、清理和容量

### 8.1 幂等与状态

- 相同用户 + 同一Idempotency-Key + 相同请求：返回同一上传会话。
- 同key不同请求：409；不能产生另一照片或重复扣预算。
- 完成接口重复调用不复制新原件、不重复计量。
- Worker超时或浏览器重启后以后台状态为准，不靠本地“成功”标志。
- 原件、预览和Live视频独立状态；失败资产可以补传。
- 处理中照片仍在“全部”中可见，能下载已提交原件。

### 8.2 删除

- 先标记deleting，立即停止签发该照片新的读取链接。
- 删除所有正式资产与待处理资产，失败可重试。
- 对仍有有效PUT签名的staging资产，记录到期后清理任务。
- 确认实际文件已删，再更新用量；只删数据库不算完成。
- 没有回收站，删除前清楚确认。对未完全删除显示处理中，不能假报已释放空间。
- 保持幂等，重复删除不造成负容量。

### 8.3 清理

提供有范围约束的维护脚本及可选低频Worker定时任务：
- 只处理有数据库登记的staging/失败会话、过期预留、待删除资产。
- 未完成上传过期后清理；原件已保存但预览失败不能整体自动删除。
- 孤立正式对象先记录报告，经有依据的规则清理；不按“年龄大”删除用户照片。
- 首次维护支持dry-run并输出不含敏感信息的数量和字节统计。
- 所有维护动作可重试；不默认遍历下载原件。
- 核对R2对象实际占用与数据库计量；有限分页，避免每天重复扫描大量对象。

### 8.4 预算默认值

建议应用上传预算8GB、提醒6GB，使用十进制字节并在配置中写清；这是初始应用阈值，不是R2收费边界保证。
- 预留原件、派生文件、Live视频、staging副本和有效签名重放窗口。
- 并发四人同时上传时必须原子预留，不能每个人分别判断剩余容量。
- 达到预算仅阻止新增资产，仍能登录、浏览、下载和删除。
- 释放预留与确认已保存用量分开，不能失败一次扣两次或提前释放。
- 四个账号共用R2免费额度，其他项目占用同一账号额度时也需纳入评估。
- 不把应用预算当供应商账单硬封顶。项目所有者需查看官方用量并设置可用的提醒。
- 若预算不足，显示实际占用和选择；不静默降低原件清晰度，不自动删除旧照片或升级付费。

## 9. PWA与GitHub Pages任务

- 设置manifest name、short_name、图标、display: standalone、theme_color、背景色。
- manifest start_url与scope匹配Pages仓库子路径；Vite base、资源引用、service worker路径统一。
- 使用hash路由或实测有效的替代方案，确保详情刷新及主屏幕启动不404。
- 提供192/512图标和适配iPhone的apple-touch-icon，不使用带版权/个人身份不明的默认图片。
- safe-area-inset适配底部导航；触控目标清楚；表单输入不会被键盘遮挡。
- service worker只缓存必要的公共静态外壳。
- 排除Supabase请求、认证响应、Worker私密JSON、R2授权URL和原件。
- 不把token、照片二进制或用户列表写入公共Cache Storage。
- 离线时可打开外壳并明确提示联网；第一版不承诺离线查看完整照片。
- 更新有明确刷新机制，不能安装新版本后永远卡在旧service worker。
- GitHub Actions构建部署前端；Worker采用受控独立工作流或明确命令部署。
- 免费GitHub Pages对代码仓库可见性有限制；公开仓库只包含代码和合成素材。
- 即使页面HTML公开，私密数据和文件仍必须受后端权限保护。
- 页面托管可改为Cloudflare静态资源，不把产品账号替换成托管平台账号体系。

## 10. 云配置与用户需要提供的内容

### 10.1 前端公开配置

| 配置名建议 | 说明 |
| --- | --- |
| VITE_SUPABASE_URL | 相册Supabase项目地址 |
| VITE_SUPABASE_PUBLISHABLE_KEY | 前端可公开的应用key，不是管理key |
| VITE_API_BASE_URL | Workers API地址 |
| VITE_BASE_PATH | GitHub Pages项目子路径，如/仓库名/ |
| VITE_APP_NAME | 家庭相册显示名 |

旧项目使用legacy anon key时可提供兼容配置，但要按当前官方文档处理，不能混淆anon和service_role。

### 10.2 仅后台配置

- SUPABASE_URL、SUPABASE_PUBLISHABLE_KEY；
- SUPABASE_SECRET_KEY（新后台key优先；旧service_role仅作明确兼容，不进浏览器）；
- R2_ACCOUNT_ID、R2_BUCKET_NAME、R2_ACCESS_KEY_ID、R2_SECRET_ACCESS_KEY；
- ALLOWED_ORIGINS；
- STORAGE_BUDGET_BYTES、STORAGE_WARNING_BYTES、签名有效期及文件大小限制；
- 如使用R2绑定，明确binding名称、开发与生产桶分离。

最小权限的R2服务密钥只允许目标相册桶，不扩大到整个账户。

### 10.3 设置步骤

1. 建立独立Supabase项目，应用迁移，检查表权限及RPC权限。
2. 禁止公众注册与匿名登录；用可信管理操作创建四个真实用户，再加入active profiles名单。
3. 若账号初始化涉及邮件或通知，不自动发邀请；默认手动建用户，不向家人发送消息。
4. 若手动确认邮箱，须由所有者确认输入的账号属于对应成员；不猜测家人的邮箱或密码。
5. 创建R2私有桶，保持r2.dev/public custom domain关闭。
6. 配置R2 CORS，允许正式前端origin以及所需PUT/GET/HEAD和头；不以CORS充当权限校验。
7. 配置Worker secrets及origin名单，部署后验证健康、认证及文件接口。
8. 创建/选择获授权GitHub仓库，设置Pages发布与前端公开配置；不要复用不相关仓库。
9. 最后绑定实际URL到Supabase允许的跳转设置及前后端配置。
10. 四部iPhone分别安装PWA并进行真实使用测试。

不要求用户把密钥贴进公开聊天。给出控制台输入、环境配置或安全凭证通道。缺配置时只暂停对应集成，不停止其他可完成开发。

## 11. 开发阶段与每阶段交付

### 阶段0：工程准备

动作：检查仓库，建立上述目录，配置TypeScript、格式/构建/测试命令，编写.env.example及状态说明。检查依赖和运行环境。

交付：工程可以安装、启动、构建；没有云密钥也能进入明确标识的本地开发界面。此时不能宣称业务已上线。

### 阶段1：先验证风险路径

动作：
- 最小登录 + 一张JPEG直传R2 + 下载原件校验。
- 测试HEIC原件导入与预览；测试Live静态与MOV成组保存。
- 测试A/B账号越权请求。
- 在具备账户与真实手机后测试大陆Wi-Fi/移动网络。
- 验证原件提交后，旧PUT签名不能修改正式原件。

交付：技术验证代码、实际测过的结果和未验证清单。没有真实iPhone则标待测，不伪造照片选择器表现。

### 阶段2：认证、数据和权限

动作：迁移、RLS、四人名单、后台JWT校验、读写约定、组合FK、预算事务、幂等。

交付：数据库/接口权限测试通过；非成员和跨用户攻击被拒绝；客户端不能自改成员资格或计量。

### 阶段3：完整静态相册

动作：登录、精选、全部、详情、上传、拍摄信息、修改精选、下载、删除、缺预览重试。

交付：用户完整流程可用。无EXIF照片仍可上传、手动补信息；原件保存与预览状态明确区分。

### 阶段4：Live素材与恢复

动作：配套视频导入、状态标记、进度、授权刷新、幂等恢复、删除失败处理、到期清理、容量提醒。

交付：完整/不完整Live素材不混淆；重试不重复建记录或扣预算；失败不丢已提交原件。

### 阶段5：PWA、发布和手机验收

动作：图标/manifest/service worker、子路径、触控布局、部署工作流、真实手机与大陆网络检查。

交付：前端和API实际部署地址（若权限及配置齐全），Supabase迁移记录，PWA安装说明，测试报告，运维/交接文档。

## 12. 必须测试的事项

### 12.1 权限测试（P0）

| 场景 | 预期 |
| --- | --- |
| 未登录访问列表/详情/签名/上传/删除 | 拒绝；不泄露私密信息 |
| A查询Supabase中B的行 | 空结果或权限拒绝 |
| A向Worker提交B的photoId/assetId | 404；不生成链接 |
| A伪造owner_id或任意object_key | 忽略或拒绝，不能影响B |
| 非家庭Supabase用户登录 | 不能访问应用数据或上传 |
| 停用成员使用仍有效的JWT | 后台拒绝新操作；数据库读权限同步受限 |
| 普通用户直接修改profile.is_active、asset.size_bytes、预算 | 权限拒绝 |
| 前端产物或Git历史扫描 | 不含管理密钥/密码/真实照片/签名URL |

### 12.2 上传和完整性（P0）

- JPEG、PNG、HEIC、截图、无EXIF、竖图、全景、大尺寸图。
- 正文与Content-MD5等传输校验不一致时拒绝。
- 下载回来的原件SHA256与上传文件一致。
- 使用严格原件导入样本比较系统导出源文件；选择器转换有明确记录。
- Live素材配对、错误配对、只有静态、只有视频、视频补传。
- 文件太大、伪造MIME、伪造大小，不能误计成成功。
- 相同幂等键重试、同键不同正文、重复complete、授权过期。
- 提交后重复使用旧PUT链接，正式原件不变。
- 原件成功、预览失败时原件仍存在且可下载。
- 多人并发上传的容量预留正确。
- 数据库写入失败/复制成功后超时/清理失败都能恢复。

### 12.3 删除、缓存和手机（P1）

- 删除全部资产并核对数据库、R2及用量；部分失败显示处理中。
- 有效PUT残留签名导致staging重建时，到期清理能收敛。
- A退出、B登录、后退/刷新/PWA恢复，无A数据闪现。
- 日期无时区不偏移成前一天/后一天；上传日期不冒充拍摄日期。
- Pages子路径的首页、详情刷新、安装与版本更新。
- 真实iPhone从相册和文件App上传、HEIC预览、原件下载、锁屏中断恢复。
- service worker不缓存私密接口与照片。
- Supabase暂停或网络失败时提示可理解，不能静默显示假照片。

### 12.4 性能与实际网络

用合成数据验证约2,000条记录的分页与渲染；不用上传2,000张真实照片才能测试列表。

记录设备、iOS版本、运营商/网络类型、测试时间、首次/重复访问：
- 页面外壳和登录耗时；
- 首屏缩略图出现时间；
- 大图预览耗时；
- 单张原件上传耗时与失败情况。

建议目标：正常网络首屏缩略图约3秒内，预览约2秒内；作为需要实测调整的体验目标，不是已达到的承诺。若大陆线路明显不满足，交付对比结果再考虑替换前端托管或后台；不要直接购买加速套餐。

## 13. 命令、测试环境和可复现性

工程必须提供与实际结构一致的命令，名称可调整，但README要准确：
- 安装依赖与启动web/api；
- TypeScript检查；
- 单元/接口测试；
- 数据库迁移和RLS集成测试；
- 前端及Worker构建；
- 浏览器端完整流程测试；
- staging清理dry-run、实际清理及用量核对；
- GitHub Pages和Workers部署。

可使用本地Supabase与R2模拟器验证业务，但真实预签名URL、Cloudflare复制/条件操作、iPhone素材和大陆网络仍需真实测试。

如果环境不支持Docker/浏览器/联网或缺凭证，完成能运行的检查并明确报告未运行项。mock通过不能写成真实云集成通过；桌面浏览器通过不能写成iPhone测试通过。

## 14. 运维和交接

OPERATIONS.md至少包括：
- 新建/停用四个账号、重置密码，不通过公开接口管理成员；
- Supabase免费项目暂停后的恢复；
- 配置变更、前端更新、Worker更新和数据库迁移；
- 原件与记录的导出备份路径；云端单份保存不替代独立备份；
- 储存用量核对、过期上传清理、预览补生成；
- 账本差异如何排查，不用“清空数据库”解决；
- R2或Supabase故障时的恢复步骤；
- 密钥轮换、日志脱敏；
- GitHub Pages子路径变更后的manifest/base/auth/origin调整；
- 常见iPhone上传转换及Live素材导入说明。

HANDOFF.md至少包括：
- 目录和关键文件；
- 已实现/未实现/实际未测；
- 平台项目配置位置（不包含真实密钥）；
- 最近有效部署版本、迁移顺序；
- 扩展Live播放、共享等功能时的边界。

## 15. 最终交付检查表

- [ ] 真实前端与Worker源码，不只有静态页面或设计图
- [ ] Supabase SQL迁移、RLS、grants和事务函数
- [ ] R2私有文件授权、不可变原件提交、完整性验收
- [ ] 四个账号、成员名单、跨用户隔离
- [ ] 全部照片、精选、详情、日期地点编辑
- [ ] 静态原件及HEIC保存与浏览处理
- [ ] Live素材成组导入及完整性状态
- [ ] 上传进度、重试、删除、清理、容量提醒
- [ ] iPhone PWA与GitHub Pages子路径支持
- [ ] 配置模板、部署工作流、README与运维文档
- [ ] 实际运行的测试结果及未测项目
- [ ] 云账户齐全时提供可验证部署；缺配置时提供完整待配置清单
- [ ] 未购买付费服务，未未经授权发送邀请或修改旧网站

## 16. 官方资料与核验要求

部署前再次核对官方当前规则；不要把文中免费额度视作永久保证。

1. [GitHub Pages概述](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)：静态托管与仓库可见性。
2. [Supabase Auth](https://supabase.com/docs/guides/auth)：认证与数据库权限。
3. [Supabase密码登录](https://supabase.com/docs/guides/auth/passwords)：邮箱密码与默认确认行为。
4. [Supabase注册配置](https://supabase.com/docs/guides/auth/general-configuration)：关闭注册与匿名登录。
5. [Supabase可信用户创建](https://supabase.com/docs/reference/javascript/auth-admin-createuser)：仅后台管理操作。
6. [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)：publishable与secret key区别。
7. [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)：表权限和管理端绕过。
8. [Supabase JWT核验](https://supabase.com/docs/reference/javascript/auth-getclaims)：已验证claims。
9. [Supabase价格](https://supabase.com/pricing)：免费数据库/账号/流量及项目限制。
10. [Supabase免费项目暂停](https://supabase.com/docs/guides/platform/free-project-pausing)：低活跃暂停。
11. [Workers静态资源](https://developers.cloudflare.com/workers/static-assets/)：替代页面托管。
12. [Workers限制](https://developers.cloudflare.com/workers/platform/limits/)：CPU、内存等。
13. [Workers Git集成](https://developers.cloudflare.com/workers/ci-cd/builds/)：源码与自动部署。
14. [R2价格](https://developers.cloudflare.com/r2/pricing/)：10GB-month免费储存与操作额度。
15. [R2预签名URL](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)：临时授权、重放、自定义域名限制。
16. [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/)：浏览器上传和过期行为。
17. [R2 S3兼容性](https://developers.cloudflare.com/r2/api/s3/api/)：条件操作、校验、复制兼容性。
18. [R2上传说明](https://developers.cloudflare.com/r2/objects/upload-objects/)：上传和ETag差异。
19. [Apple PWA安装](https://support.apple.com/zh-cn/guide/iphone/iphea86e5236/ios)：添加到主屏幕。
20. [Apple原件与Live Photo导出](https://support.apple.com/en-au/guide/photos/pht6e157c5f/mac)：图片和配套视频。
21. [WebKit选图格式转换](https://bugs.webkit.org/show_bug.cgi?id=292350)：浏览器与原件的差别。

---

## 17. 可直接粘贴给Codex的启动提示词

~~~text
请读取附件《家庭相册_Codex执行计划_v1.0.md》，把它作为完整开发任务书，开始实际实现项目，不要只回复建议或再次整理计划。

我们要自己开发四人私密家庭相册PWA：每人约500张，保留原件，静态浏览，保存Live Photo配套视频，支持拍摄日期/地点和上传后精选。

源码放GitHub；前端优先GitHub Pages；Supabase Auth + PostgreSQL负责账号和照片记录；Cloudflare Workers授权文件操作；R2私有桶保存原件及浏览版本。

先检查已有工作目录和适用AGENTS.md，按计划书阶段执行。缺少云凭证时继续完成代码、迁移、配置模板和可运行测试，明确模拟与真实集成的区别，并集中给出待配置清单。不要自行购买付费服务，不修改我之前的另一个网站，不自动发家庭邀请。

必须实现后台账号隔离、原件与预览分离、上传幂等、容量预留、完整性验证和私密PWA缓存策略。不能以一个前端模拟相册代替真实系统，也不能假称iPhone上传会自动保留完整Live Photo。

完成后交付工程、部署说明、实际测试结果、未验证项与维护交接。云账户与部署权限齐全时按目标平台发布并核验，否则如实交付可部署工程。
~~~
