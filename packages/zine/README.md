# 旅游 Zine 网页模板 · 1.0

三套视觉方向、12 个固定跨页，已接入本项目的网络相册编辑与播放界面。模板读取照片现有的标题、拍摄时间、地点；每一页另有可手填的短句。照片位置、文字位置、字体、基础字号、色彩和裁切比例由模板固定。

本目录是可移植的 React / TypeScript 模板组件与完整 WOFF2 字体。交付压缩包另附当前网站的编辑器、播放器、API 与数据库接入文件。它用于网站实际运行，接入不需要安装 Codex skill。

## 字体与视觉方向

| 模板值       | 视觉方向                                        | 字体搭配                          |
| ------------ | ----------------------------------------------- | --------------------------------- |
| `zine-city`  | 途中 · 城市采样：大字、朱红侧标、大小图对照     | 得意黑、Inter、思源宋体           |
| `zine-diary` | 余日 · 旧日游记：纵排、旧书纸色、票据、小图留白 | 汇文明朝体、EB Garamond、思源宋体 |
| `zine-coast` | 潮汐 · 海岸档案：跨页长图、细笔画标题、少量叠片 | 思源宋体、Libre Bodoni、Inter     |

思源黑体用作无衬线字体中汉字的后备字体。`src/ZineFonts.tsx` 使用本地 WOFF2 文件生成 `@font-face`，字体随 Vite 构建成为网站自身的静态资源。访客不需要在电脑或手机安装字体，页面不请求外部字体 CDN。字体别名统一带 `Zine` 前缀，避免与网站其他字体冲突。

字体保留完整字库，约 24 MiB，避免用户换标题或地点后遇到只包含示例文字的残缺字库。采用 `font-display: swap`；本网站的 Service Worker 会在首次打开后后台预存全部字体和程序资源，后续复用本地缓存。完整许可证与来源见 [FONT_SOURCES.md](FONT_SOURCES.md) 和 `licenses/`。方正 FW 筑紫古典、Helvetica、Futura、Frutiger、商业 Bodoni / Univers 文件不在本包内。

## 数据结构：自动文字与手写文字

传入照片的最小结构：

```ts
type ZinePhoto = {
  id: string;
  title: string | null;
  captured_local: string | null; // 原照片当地拍摄时间，例如 2026-10-12T17:36:00
  location_label: string | null;
  src?: string; // 公开图片可用；私有相册建议使用 renderPhoto
};
```

保存的影集配置只包含版本、跨页编号、版式、照片 ID 和用户填写的文字：

```json
{
  "version": 1,
  "pages": [
    {
      "id": "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      "layout": "diary-opening",
      "photo_ids": ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
      "texts": {
        "english-title": "Days\nelsewhere.",
        "intro": "今天沿着海岸慢慢走。\n把风声留在这一页。"
      }
    }
  ]
}
```

- 自动标题、地点和时间不复制到 `texts`，每次显示从当前 `photos` 按 ID 读取。重新打开影集时加载最新照片资料；正在打开的影集不主动实时订阅数据库。
- `photo_ids[0]` 是位置 1，`photo_ids[1]` 是位置 2。删除、移出或撤回共享后，该位置设为 `null`，关联自动文字隐藏，其他照片不会顶替。编辑器移除全空跨页；播放器保留可见影集中的空位置。
- 时间保留 `captured_local` 的当地钟表时间，显示为 `2026.10.12 17:36`，不擅自改为 UTC。没有标题、时间或地点时，对应设计文字隐藏，不编造旅行事实。
- 输入是纯文本，支持换行，不接受 HTML。空字符串表示主动隐藏该文字；字段未填写时使用模板默认短句。照片资料在原照片的编辑界面修改。
- 图片地址、签名、身份令牌不写入影集配置。私有图使用网站现有鉴权与短期读图地址。
- 影集名称用于三套模板的开篇题名。其他页面的大标题按下表取自照片标题或独立输入框。英文短句由用户填写，不自动翻译中文元数据。

## 12 个版式的文字约定

以下位置编号从 1 开始；“完整资料”指标题、地点和当地拍摄时间。各输入框字数上限、默认值、坐标及字号均在 `src/catalog.ts`，前端与 API 使用同一目录。

| 版式 ID           | 照片数 | 自动读取的文字                                       | 可手填的文字                               |
| ----------------- | -----: | ---------------------------------------------------- | ------------------------------------------ |
| `city-opening`    |      1 | 影集题名、位置 1 完整资料、页码                      | 英文题名、序言、封面短句                   |
| `city-pause`      |      2 | 位置 1 标题／地点／时间、位置 2 完整资料、章号／页码 | 页角标签                                   |
| `city-sequence`   |      3 | 三张照片各自完整资料、页码                           | 组照题名、英文副题、这一页的随记           |
| `city-window`     |      1 | 位置 1 标题／地点／时间、页码                        | 收尾短句                                   |
| `diary-opening`   |      1 | 影集题名、位置 1 地点和完整资料、页码                | 英文题名、序言                             |
| `diary-band`      |      1 | 位置 1 标题／地点／时间、章号／页码                  | 英文短句、车窗随记                         |
| `diary-small`     |      2 | 位置 1 标题／地点／时间、位置 2 完整资料、页码       | 英文题句                                   |
| `diary-keepsakes` |      2 | 位置 1 标题／地点／时间、位置 2 完整资料、页码       | 收藏页题名、英文副题、存根题名、收藏页随记 |
| `coast-opening`   |      1 | 影集题名、位置 1 完整资料、页码                      | 英文题名、序言                             |
| `coast-layer`     |      2 | 两张照片各自标题／地点／时间、页码                   | 组照题名、英文题句、英文随记               |
| `coast-band`      |      1 | 位置 1 完整资料、页码                                | 英文题名、中文题名、页内短句一／二         |
| `coast-ending`    |      2 | 位置 1 标题／地点／时间、页码；位置 2 为收尾细节图   | 英文收尾题句、英文落款                     |

## 最小接入

运行环境：React 19、TypeScript、Vite 或可处理 `.woff2` 和 CSS 导入的打包工具；保存校验使用 Zod 4。直接复制 `packages/zine/`，保持字体、许可证和源码的相对路径。Vite 项目需包含 `vite/client` 类型。

```tsx
import {
  ZineSpread,
  getZineCollection,
  newZineConfig,
} from "./packages/zine/src";

const template = "zine-diary";
const config = newZineConfig(photos, template);

<ZineSpread
  collection={getZineCollection(template)}
  page={config.pages[0]}
  photos={photos}
  title="雨天行记"
  index={0}
  view="spread"
  renderPhoto={(photo) => (
    <YourAuthorizedImage key={photo.id} photoId={photo.id} />
  )}
/>;
```

这是显示示例；编辑时把 `config` 放入 React state。输入框从 `getZineLayout(page.layout).fields` 生成，使用 `field.label`、`field.maxLength` 和 `page.texts[field.key] ?? field.default`；写入时只修改该页的 `texts`。照片选择只修改该页的 `photo_ids`，不要修改节点的坐标或字号。完整的受控编辑器与播放器见交付包 `apps/web/src/ZineStudio.tsx`。

`newZineConfig(photos, template)` 首张开篇，随后双图跨页，余下一张用单图页；`syncZineConfig` 保持已有位置与手写内容，移除无效引用、补入新照片。跨页可增加、移除、调序，照片可分配到各位置，同一照片可以用于不同跨页。同一跨页内不重复绑定照片。

当前网站允许每本选择 2–60 张照片，最多 60 个跨页；每张所选照片须至少安排一次。用户可在 4 种版式之间切换。当前编辑会话中，切换版式或模板再返回会恢复对应文字草稿；保存到服务器的是当前选用的模板与版式。

## 屏幕尺寸与文字适配

设计坐标为跨页 `1440 × 960`，单页 `720 × 960`。`view="spread"` 显示跨页；手机依次用 `left`、`right` 展示。播放器支持左右按钮、键盘、横向滑动、6 秒自动放映和按页跳转；没有连续进度条。切换动画可选平移、淡入、轻推，系统减少动画设置优先。开启完整文字阅读时自动暂停。

字号是设计坐标中的 px，整个版面随容器等比缩放。字体加载后重新测量；文字过长时在固定区域内缩小，仍超出时显示省略号。完整文字始终保留在可展开的阅读区及无障碍标签中。照片使用固定比例裁切，不改变原图，重要主体应在原照片选择时考虑裁切。

## 当前网站的接入文件

1. `packages/zine/`：目录、渲染、数据绑定、保存校验与字体。
2. `apps/web/src/ZineStudio.tsx`、`zine-studio.css`：版面选择、文字输入、照片分配、预览与播放。
3. `apps/web/src/StoryStudio.tsx`：已有影集页面接入新模板，继续使用原有私有图片加载、账号与分享逻辑。依赖本网站原有 `story.css`、`client.ts`、图片会话缓存和共享类型。
4. `apps/api/src/handler.ts`：校验保存数据，影集 CRUD 使用 `album_v8_action`，公开链接用独立的受控读取函数。
5. `supabase/migrations/202610140002_zine_templates.sql` 和 `202610140003_story_music_public.sql`：新增配置、颜色、音乐与可撤销链接。依赖前六次迁移，发布时先迁移、再 API 与网关、最后网页。
6. `scripts/local-database.ts`：本地 SQL 演示加载全部八次迁移；`scripts/pwa-plugin.ts` 和 `service-worker-template.ts`：后台预存全部网站静态资源。

当前网站还支持 `background_color`（规范为 `#RRGGBB`）、单曲音乐配置、公开观看链接与静态 PDF 导出。音乐适配器见 `src/music.ts`，站点接入和验证边界见 [发布说明](../../docs/ZINE_RELEASE.md)。另一份网站应逐项合并，勿盲目覆盖已有页面或接口。接入过程不需要打包真实照片、环境密钥或数据库导出。

## 验证

本项目运行 `npm run typecheck`、`npm test`、`npm run test:e2e`、`npm run test:pwa` 与 `npm run build:api`。浏览器测试覆盖三套模板的 12 种版式、自动资料变化、手写换行保存、切换模板保留草稿、手机左右页与同源字体加载；接口测试覆盖所有版式保存及私有／撤回共享的照片引用过滤。示例预览使用演示图片和演示文字。
