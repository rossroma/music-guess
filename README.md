# 猜歌名游戏

移动端华语音乐猜歌网页游戏。听一段时长受限的 Apple Music 试听片段，从下方字符池中按顺序点击汉字，拼出正确的歌曲名称。

---

## 游戏玩法

1. **筛选** — 选择年代、语言（国语 / 粤语）、歌手、难度
2. **收听** — 片段时长由难度决定：简单 30 秒 / 中等 20 秒 / 困难 10 秒
3. **拼歌名** — 点击下方备选汉字，按顺序填入格子
4. **计分规则**
   - 第一次答对：**+3 分**
   - 第一次答错 → 重试，第二次答对：**+1 分**
   - 两次均答错：**+0 分**，揭示正确答案
5. **结算** — 10 首全部完成后展示总分与历史最高分

---

## 技术栈

| 层次 | 技术 |
|------|------|
| 后端 | Node.js + Express |
| 前端 | 原生 HTML / CSS / JavaScript（无框架，SPA） |
| 音频 / 封面 | iTunes Search API（免费，无需鉴权） |
| 部署 | Vercel（`@vercel/node` + `@vercel/static`） |
| 存储 | `localStorage`（历史最高分本地缓存） |

---

## 快速开始

### 本地运行

```bash
# 1. 安装依赖
npm install

# 2. 启动服务
npm start

# 3. 打开游戏
# 浏览器访问 http://localhost:3000
```

无需任何 API Key，开箱即用。

### 部署到 Vercel

```bash
npm install -g vercel
vercel
```

或直接在 [vercel.com](https://vercel.com) 导入 Git 仓库，无需配置任何环境变量。

---

## 项目结构

```
├── server.js              # Express 服务 + iTunes API 封装
├── songs-summary.json     # 汇总后的歌曲库（由 scripts/aggregate-songs.js 生成）
├── vercel.json            # Vercel 部署配置
├── data/                  # 原始榜单 JSON（多年代/多榜单，见下方数据格式）
├── scripts/
│   └── aggregate-songs.js # 汇总 data/*.json 为 songs-summary.json（去重、补 initial/pinyin）
├── logs/                  # 自动生成：无试听链接的歌曲记录
│   └── missing-preview.log
└── public/
    ├── index.html         # 游戏页面（SPA）
    ├── game.css           # 样式（Apple Music / iOS 深色主题）
    ├── game.js            # 游戏逻辑（状态机 + 懒加载 + 音频控制）
    └── test-audio.html    # 音频播放诊断工具
```

---

## API 接口

### `GET /api/game/candidates`

快速返回本地歌曲列表（不调用 iTunes），用于生成干扰字符池。

| 参数 | 说明 | 默认 |
|------|------|------|
| `lang` | `zh` / `yue` / `any` | `any` |
| `era` | `2020-2026` / `2010-2019` / `2000-2009` / `1990-1999` / `pre-1990` / `any` | `any` |
| `artist` | 歌手名（模糊匹配，留空不限） | 空 |

### `GET /api/game/songs`

返回 iTunes 补全后的歌曲（含 `previewUrl` 和封面），仅包含能找到试听链接的歌曲。

| 参数 | 说明 | 默认 |
|------|------|------|
| `lang` | 同上 | `any` |
| `era` | 同上 | `any` |
| `artist` | 同上 | 空 |
| `count` | 返回数量 | `1` |
| `exclude` | 已用歌曲 ID，逗号分隔 | 空 |

---

## 歌曲数据库

歌曲库来自 `data/` 目录下多份榜单 JSON，经 `scripts/aggregate-songs.js` 汇总去重后生成 `songs-summary.json`。服务端直接读取该文件。

**数据格式（data 目录）**：每份 JSON 为歌曲数组，或对象内单一数组；每条记录包含 `rank`、`singer`、`song`、`year`、`lang`。脚本会统一为 `title`/`artist`，并自动计算 `initial`（拼音首字母）、`pinyin`（全拼）。

**汇总后每条歌曲字段**：

```json
{
  "id": 1,
  "title": "青花瓷",
  "artist": "周杰伦",
  "year": 2007,
  "lang": "zh",
  "initial": "QHC",
  "pinyin": "qinghuaci"
}
```

重新生成歌库：

```bash
node scripts/aggregate-songs.js
```

`logs/missing-preview.log` 会自动记录 iTunes 找不到试听链接的歌曲，便于维护歌库质量。

---

## 开发说明

### 音频懒加载策略

- 点击「开始游戏」后立即请求第一首（并行获取干扰字符候选库）
- 第一首播放期间后台预取第二首
- 切歌时几乎无等待；若预取未完成会短暂显示「加载下一首…」

### 浏览器自动播放策略

点击「开始游戏」时播放一段 44 字节的静音 WAV，使 `<audio>` 元素获得粘性播放权限，之后异步加载完成后可直接自动播放。

### 新增歌曲

1. 在 `data/` 下新增或编辑榜单 JSON，格式为数组 `[{ "rank", "singer", "song", "year", "lang" }, ...]`，或对象 `{ "某key": [ ... ] }`。
2. 运行 `node scripts/aggregate-songs.js` 重新生成 `songs-summary.json`。
3. `initial`、`pinyin` 由脚本根据歌名自动生成（依赖 `pinyin` 包）。
