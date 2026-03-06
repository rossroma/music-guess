# 猜歌名游戏 设计文档

> 基于本地歌曲数据库的移动端网页猜歌游戏

---

## 一、产品概述

### 1.1 产品定位

面向移动设备的音乐猜歌网页小游戏。玩家通过收听一段时长受限的歌曲片段，从屏幕下方的备选汉字中按顺序点击，拼出正确的歌曲名称。支持按年代、歌手、语言自定义筛选歌曲池，适合碎片化娱乐场景。

### 1.2 技术栈

- **后端**：Node.js + Express（`server.js`）
- **前端**：纯 HTML + CSS + JavaScript（无框架，SPA）
- **音乐数据源**：本地 `songs.json`（100首华语经典歌曲）
- **音频 / 封面**：Apple Music API（MusicKit JS）
- **存储**：localStorage（历史最高分缓存）
- **部署**：Vercel（`@vercel/node` + `@vercel/static`）

### 1.3 与原版的主要变更

| 变更项 | 原版 | 当前版本 |
|-------|------|---------|
| 音乐数据源 | Spotify Web API | 本地 `songs.json` |
| 音频播放 | Spotify `preview_url`（30s 片段） | Apple Music API（MusicKit JS） |
| 热度筛选 | Spotify `popularity` 字段 | 已移除（本地库无此字段） |
| 封面图 | Spotify 专辑封面 URL | Apple Music API 返回的 `artwork.url` |

---

## 二、游戏流程

```
开始页面 → 筛选配置 → 难度选择 → 加载歌曲池（10首）
    → [循环10轮]
        播放片段
        → 上方：播放器（进度条 + 重播按钮）
        → 中间：歌名空格（N个格子，对应歌名字数）
        → 下方：备选汉字池（按顺序点击拼出歌名）
            → 第1次全部填对：+3分 → 显示结果 → 下一首
            → 第1次填错 → 清空重填 → 第2次填对：+1分 → 下一首
            → 第2次填错：0分 → 揭示正确答案 → 下一首
    → 10首完成 → 结算页面（分数 + 历史最高分）
```

---

## 三、功能模块详解

### 3.1 筛选系统

玩家在开始游戏前可设置以下筛选条件：

| 筛选维度 | 选项 | 实现方式 |
|---------|------|---------|
| **年代** | 更早（1989前）/ 90年代 / 00年代 / 10年代 / 近几年 / 不限 | 服务端按 `year` 字段范围过滤 |
| **语言** | 国语（`zh`）/ 粤语（`yue`）/ 不限 | 服务端按 `lang` 字段精确匹配 |
| **歌手** | 文本输入（可选，留空则不限） | 服务端按 `artist` 字段包含匹配 |

> 注意：前端传给 `/api/game/songs` 的 `lang` 参数须与 `songs.json` 中的值一致：`zh`（国语）或 `yue`（粤语）。

**筛选 UI 设计**：

```
┌─────────────────────────────┐
│       🎵 猜歌名游戏          │
├─────────────────────────────┤
│ 年代  [不限▼]               │
│ 语言  [国语] [粤语] [不限]  │
│ 歌手  [____________]        │
├─────────────────────────────┤
│ 难度  [简单] [中等] [困难]  │
│        30s    20s    10s   │
├─────────────────────────────┤
│     [  开始游戏  ]          │
└─────────────────────────────┘
```

### 3.2 难度系统

| 难度 | 可收听时长 | 计分规则 |
|-----|----------|---------|
| 简单 | 30 秒 | 一次答对 +3，二次答对 +1，两次错误 +0 |
| 中等 | 20 秒 | 同上 |
| 困难 | 10 秒 | 同上 |

音频播放通过 `audio.currentTime` 限制时长，到达上限后自动暂停。

### 3.3 游戏轮次逻辑

每轮流程：

1. **播放片段**：自动开始播放当前歌曲，限制在难度对应时长内
2. **展示界面**：
   - 上方播放器自动运行，显示进度和时间
   - 中间显示空格（N个格子，N = 歌名字数）
   - 下方显示备选汉字池（约24个字，含正确答案的所有汉字 + 干扰字）
3. **玩家操作**：依次点击备选字，按顺序填入空格
   - 点击已填入的格子可取消该字（返回字符池）
   - 所有格子填满时自动提交答案
4. **答题判定**：
   - 填对（第1次）→ 格子全部变绿 + "+3分" 浮动 → 下一首
   - 填错（第1次）→ 格子全部震动变红 → 650ms 后自动清空，可重新作答
   - 填对（第2次）→ 格子全部变绿 + "+1分" 浮动 → 下一首
   - 填错（第2次）→ 格子变橙色，自动揭示正确答案 → "+0分" → 下一首
5. **进度显示**：顶部显示 `第 X / 10 首` 和当前累计得分

### 3.4 备选字池生成规则

- **正确字**：歌名中的所有汉字（去重后全部放入）
- **干扰字**：从同池其他歌名中随机取汉字，总字数填充至约 24 个
- **打乱顺序**：所有字随机排列，不暗示顺序
- **使用标记**：已点击使用的字变灰并禁用，取消后恢复

### 3.5 结算页面

```
┌─────────────────────────────┐
│         游戏结束！           │
│                             │
│      本局得分：  24分        │
│      历史最高：  27分  🏆    │
│                             │
│   [10首歌曲回顾列表]         │
│   ✓ 周杰伦 - 七里香   +3   │
│   ✗ 陈奕迅 - 富士山下  +0   │
│   ✓ 王菲 - 红豆       +1   │
│   ...                       │
│                             │
│  [再来一局] [修改筛选条件]  │
└─────────────────────────────┘
```

- 本局得分与历史最高分对比
- 若打破历史最高分，显示 "新纪录！" 庆祝动画
- 回顾列表：每首歌的歌名、歌手、得分情况

---

## 四、页面结构与 UI 设计

### 4.1 文件结构

```
spotify-demo/
├── server.js          # Express 后端
├── songs.json         # 本地歌曲数据库（100首）
├── vercel.json        # Vercel 部署配置
├── package.json
└── public/
    ├── index.html     # 游戏主页（SPA，4个视图）
    ├── game.css       # 样式（深色主题，移动端优先）
    └── game.js        # 游戏逻辑（状态机）
```

### 4.2 视图划分（SPA）

```
#view-start     开始/配置视图
#view-loading   加载歌曲池视图（加载动画）
#view-game      游戏主视图
#view-result    结算视图
```

### 4.3 游戏主视图布局（移动端竖屏）

```
┌─────────────────────────────┐  ← 375px 宽
│  第 3 / 10 首    得分: 12   │  ← 顶栏（进度+分数）
├─────────────────────────────┤
│                             │
│  ┌─────────────────────┐    │
│  │ 专辑封面（答题中模糊）│    │  ← 答对/失败后清晰显示
│  └─────────────────────┘    │
│                             │
│  ██████████████░░░░  0:15   │  ← 播放进度条
│  [↺ 重播]  正在播放...      │  ← 重播按钮 + 状态
│                             │
├─────────────────────────────┤
│                             │
│   [ 七 ] [ 里 ] [ 香 ]      │  ← 歌名空格（N个格子）
│                             │
├─────────────────────────────┤
│                             │
│  备选字（随机排列约24个）     │
│  [七][里][香][爱][在][雨][季]│
│  [情][风][花][月][夜][我][你]│
│  [心][中][的][日][子][岁][月]│
│                             │
│  [  下一首 ▶  ]            │  ← 答题后显示
└─────────────────────────────┘
```

### 4.4 视觉风格

- **主题**：深色（`#121212` 背景）
- **主色调**：`#1DB954`（绿）
- **错误色**：`#E22134`（红）
- **正确色**：`#1DB954`（绿）
- **字体**：系统字体，中文优先
- **动画**：`shake`、`correctPop`、`scoreFloat`、`recordPop`、`slideUp`

---

## 五、技术实现

### 5.1 本地歌曲数据库（songs.json）

每条记录结构：

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

| 字段 | 说明 |
|-----|------|
| `id` | 唯一整数 ID |
| `title` | 歌曲名称 |
| `artist` | 歌手名 |
| `year` | 发行年份 |
| `lang` | 语言：`zh`（国语）/ `yue`（粤语） |
| `initial` | 歌名拼音首字母缩写（用于搜索） |
| `pinyin` | 歌名完整拼音（用于搜索） |

当前收录约 100 首华语经典歌曲，涵盖周杰伦、蔡依林、张韶涵、苏打绿、五月天、王菲、陈奕迅、Beyond、刘若英、张惠妹等。

### 5.2 后端 API

#### `GET /api/game/songs`

按条件筛选并返回随机打乱的歌曲列表。

**请求参数**：

| 参数 | 类型 | 默认值 | 说明 |
|-----|------|-------|------|
| `lang` | string | `any` | `zh` / `yue` / `any` |
| `era` | string | `any` | `pre-1990` / `1990-1999` / `2000-2009` / `2010-2019` / `2020-2026` / `any` |
| `artist` | string | `''` | 歌手名（包含匹配，留空不限） |
| `count` | number | `50` | 返回歌曲数量上限 |

**响应结构**：

```json
{
  "songs": [
    {
      "id": "1",
      "name": "青花瓷",
      "artists": ["周杰伦"],
      "album": "",
      "coverUrl": "",
      "previewUrl": "",
      "popularity": null,
      "year": 2007,
      "lang": "zh",
      "initial": "QHC",
      "pinyin": "qinghuaci"
    }
  ],
  "total": 50
}
```

> `coverUrl` 和 `previewUrl` 当前为空字符串，待 Apple Music API 接入后填充。

#### `GET /api/search/tracks`

按关键词搜索歌曲（支持歌名、歌手、拼音、首字母）。

**请求参数**：`q`（必填）、`limit`（默认20）、`offset`（默认0）

### 5.3 游戏核心状态机

```javascript
const gameState = {
  config: {
    lang: 'any',         // 'zh' | 'yue' | 'any'
    era: 'any',          // 年代字符串或 'any'
    artist: '',          // 歌手名（可空）
    difficulty: 'medium' // 'easy'(30s) | 'medium'(20s) | 'hard'(10s)
  },
  phase: 'idle',         // 'idle' | 'loading' | 'playing' | 'roundEnd' | 'gameEnd'
  feedbackType: null,    // null | 'correct' | 'wrong-retry' | 'wrong-revealed'
  songs: [],             // 10首歌曲对象
  currentIndex: 0,
  round: {
    wrongAttempts: 0,
    charPool: [],
    usedPoolIndices: [],
    slots: [],
  },
  totalScore: 0,
  history: [],
};
```

**状态转换**：

```
idle
  → [点击"开始游戏"] → loading
  → [加载完成] → playing（第1首）

playing
  → [填满格子，答对] → feedbackType='correct', phase='roundEnd'
  → [填满格子，答错，wrongAttempts=0] → feedbackType='wrong-retry'
      → [650ms后自动清空] → feedbackType=null（继续playing，wrongAttempts=1）
  → [填满格子，答错，wrongAttempts=1] → feedbackType='wrong-revealed', phase='roundEnd'

roundEnd
  → [点击"下一首"] → playing（下一首）或 gameEnd（第10首后）

gameEnd
  → [点击"再来一局"] → idle（重置）
```

### 5.4 备选字池生成

```javascript
function generateCharPool(currentSong, allSongs, poolSize = 24) {
  const correctChars = [...new Set(currentSong.name.split(''))];
  const distractors = new Set();
  shuffleArray(allSongs.filter(s => s.id !== currentSong.id)).forEach(song => {
    song.name.split('').forEach(char => {
      if (!correctChars.includes(char)) distractors.add(char);
    });
  });
  const pool = [...correctChars, ...Array.from(distractors)].slice(0, poolSize);
  return shuffleArray(pool);
}
```

### 5.5 音频控制

```javascript
// 限制播放时长
audio.addEventListener('timeupdate', () => {
  if (audio.currentTime >= DIFFICULTY_TIME[gameState.config.difficulty]) {
    audio.pause();
  }
});
```

音频来源为 Apple Music API 通过 MusicKit JS 返回的预览片段 URL（`previewUrl`），封面图使用 `artwork.url`（替换尺寸占位符后使用）。

### 5.6 localStorage 历史分数

```javascript
const STORAGE_KEY = 'songguess_highscore';

function getHighScore() {
  return parseInt(localStorage.getItem(STORAGE_KEY) || '0');
}

function updateHighScore(score) {
  if (score > getHighScore()) {
    localStorage.setItem(STORAGE_KEY, score.toString());
    return true; // 新纪录
  }
  return false;
}
```

---

## 六、移动端适配要点

1. **触控区域**：选项按钮最小高度 56px
2. **视口**：`<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">`
3. **音频自动播放**：移动端需用户手势触发，游戏流程设计为"点击开始"后触发第一次播放
4. **横屏适配**：以竖屏为主，横屏显示提示
5. **safe area**：使用 `env(safe-area-inset-bottom)` 适配刘海/圆角屏

---

## 七、待办事项

| 优先级 | 事项 |
|-------|------|
| 高 | 修复语言筛选：前端传 `zh`/`yue`，与 `songs.json` 的 `lang` 字段对齐 |
| 中 | 扩充 `songs.json` 歌曲数量 |
| 低 | 新纪录庆祝动画 |
| 低 | 横屏适配优化 |
