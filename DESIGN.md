# 猜歌名游戏 设计文档

> 基于 Spotify Web API 的移动端网页猜歌游戏

---

## 一、产品概述

### 1.1 产品定位

面向移动设备的音乐猜歌网页小游戏。玩家通过收听一段时长受限的歌曲片段，从屏幕下方的备选汉字中按顺序点击，拼出正确的歌曲名称。支持按年代、热度、歌手、语言自定义筛选歌曲池，适合碎片化娱乐场景。

### 1.2 技术栈

- **后端**：Node.js + Express（复用现有 `server.js`）
- **前端**：纯 HTML + CSS + JavaScript（无框架）
- **API**：Spotify Web API（`spotify-web-api-node`）
- **存储**：localStorage（历史最高分缓存）
- **部署**：Express 静态文件托管，新增游戏页面于 `public/game/`

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

玩家在开始游戏前可设置以下筛选条件（各项可单选或不设限）：

| 筛选维度 | 选项 | 实现方式 |
|---------|------|---------|
| **年代** | 60-70年代 / 80年代 / 90年代 / 00年代 / 10年代 / 近5年 / 不限 | Spotify search `year:YYYY-YYYY` 过滤 |
| **语言** | 国语 / 粤语 / 闽南语 / 不限 | 预设关键词搜索策略（见 §5.1） |
| **热度** | 热门（popularity ≥ 70）/ 冷门（popularity < 40）/ 不限 | 客户端过滤 Spotify `popularity` 字段 |
| **歌手** | 文本输入（可选，留空则不限） | Spotify `artist:XXX` 搜索修饰符 |

**筛选 UI 设计**：

```
┌─────────────────────────────┐
│       🎵 猜歌名游戏          │
├─────────────────────────────┤
│ 年代  [不限▼]               │
│ 语言  [国语] [粤语] [闽南]  │
│       [不限]                │
│ 热度  [热门] [冷门] [不限]  │
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

> Spotify preview_url 提供最长 30 秒片段。难度通过 `audio.currentTime` 限制播放时长实现，到达上限后自动暂停并隐藏进度超出部分。

### 3.3 游戏轮次逻辑

每轮流程：

1. **播放片段**：自动开始播放当前歌曲，限制在难度对应时长内
2. **展示界面**：
   - 上方播放器自动运行，显示进度和时间
   - 中间显示空格（N个格子，N = 歌名字数）
   - 下方显示备选汉字池（约20～27个字，含正确答案的所有汉字 + 干扰字）
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

备选字池参考 CeleGuess 的 `generateCharPool` 思路，针对歌名汉字生成：

- **正确字**：歌名中的所有汉字（去重后全部放入）
- **干扰字**：从同池其他歌名中随机取汉字，总字数填充至约 20～27 个
- **打乱顺序**：所有字随机排列，不暗示顺序
- **使用标记**：已点击使用的字变灰并禁用（避免重复使用），取消后恢复
- **对于英文歌名**：以单词为单位显示（而非逐字母），干扰词取其他歌名的单词

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
- 回顾列表：每首歌的专辑封面、歌名、歌手、得分情况

---

## 四、页面结构与 UI 设计

### 4.1 页面文件结构

```
public/
└── game/
    ├── index.html      # 游戏主页（开始 + 配置）
    ├── game.html       # 游戏主界面
    ├── result.html     # 结算页面
    ├── game.css        # 游戏样式（移动端优先）
    └── game.js         # 游戏逻辑
```

（也可合并为单页面 SPA，通过 JS 控制显示不同视图）

**推荐方案**：单 HTML 文件 + 多视图切换（`display:none/block`），减少页面跳转开销。

### 4.2 视图划分（SPA 方案）

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
│                             │  ← 点击已填格子可取消
├─────────────────────────────┤
│                             │
│  备选字（随机排列约20～27个）  │
│  [七][里][香][爱][在][雨][季]│
│  [情][风][花][月][夜][我][你]│
│  [心][中][的][日][子][岁][月]│
│  ...                        │
│                             │
│  [  下一首 ▶  ]            │  ← 答题后显示
└─────────────────────────────┘
```

**交互细节**：
- 点击备选字 → 填入最左侧空格，该字变灰（已使用）
- 点击已填格子 → 清除该格子，对应字恢复可用
- 所有格子填满 → 自动判断，触发动画反馈
- 播放时长到达难度上限后自动暂停，[↺ 重播] 可重新从头播放（但每次重播会有限制，或不限制，视体验而定）

### 4.4 视觉风格

- **主题**：深色（与 Spotify 风格一致，#121212 背景）
- **主色调**：Spotify 绿 #1DB954
- **错误色**：#E22134（红）
- **正确色**：#1DB954（绿）
- **字体**：系统字体，中文优先
- **动画**：
  - 答题反馈：按钮颜色渐变 + 轻微震动（错误时）
  - 分数变化：数字弹跳动画
  - 新纪录：粒子/星星庆祝效果
  - 封面揭晓：模糊 → 清晰的渐变过渡

---

## 五、技术实现方案

### 5.1 歌曲池构建策略

**语言 + 年代组合搜索**：

Spotify API 不直接提供语言过滤，通过以下策略实现：

```
语言映射关键词（搜索 playlist 或 market）：
- 国语  → 搜索词添加 "mandarin" / "华语" / "国语" + 指定市场 TW/HK
- 粤语  → 搜索词添加 "cantonese" / "粤语" / "Cantopop"
- 闽南语 → 搜索词添加 "闽南" / "台语" / "minnan"

年代映射：
- 近5年   → year:2020-2025
- 10年代  → year:2010-2019
- 00年代  → year:2000-2009
- 90年代  → year:1990-1999
- 80年代  → year:1980-1989
- 60-70年代 → year:1960-1979

搜索示例：
"粤语 经典 year:1990-1999"
"华语流行 year:2020-2025"
```

**歌曲池筛选流程**：

```javascript
// 1. 根据条件构建搜索词
// 2. 调用 /api/search/tracks（多次请求，offset随机）
// 3. 过滤：必须有 preview_url（否则无法播放）
// 4. 过滤：popularity 热度条件
// 5. 随机打乱，取前50首作为候选池
// 6. 从候选池随机抽取10首作为本局歌曲
```

**新增后端 API**（server.js 扩展）：

```
GET /api/game/songs?lang=mandarin&era=2000-2009&popularity=high&artist=周杰伦&count=50
```

服务端封装多次 Spotify 搜索、去重、过滤，返回符合条件的歌曲列表。

### 5.2 游戏核心状态机

```javascript
const gameState = {
  // 配置
  config: {
    lang: 'mandarin',    // 'mandarin' | 'cantonese' | 'minnan' | 'any'
    era: '2000-2009',    // 年代字符串
    popularity: 'high',  // 'high' | 'low' | 'any'
    artist: '',          // 歌手名（可空）
    difficulty: 'medium' // 'easy'(30s) | 'medium'(20s) | 'hard'(10s)
  },

  // 阶段状态机（参考 CeleGuess）
  // phase: 'idle' | 'loading' | 'playing' | 'roundEnd' | 'gameEnd'
  phase: 'idle',

  // 答题反馈类型（参考 CeleGuess feedbackType）
  // feedbackType: null | 'correct' | 'wrong-retry' | 'wrong-revealed'
  feedbackType: null,

  // 歌曲池
  songs: [],           // 10首歌曲对象
  currentIndex: 0,     // 当前第几首（0-9）

  // 当前轮次状态
  round: {
    wrongAttempts: 0,  // 已答错次数（0/1/2）
    charPool: [],      // 备选字数组（约20～27个，已打乱）
    usedPoolIndices: [],  // 已使用的字池索引（变灰禁用）
    slots: [],         // 当前已填入格子的字（数组，长度=歌名字数）
  },

  // 全局积分
  totalScore: 0,
  history: [],         // 每轮结果记录 [{song, score, wrongAttempts}]
};

// 难度对应播放时长（秒）
const DIFFICULTY_TIME = { easy: 30, medium: 20, hard: 10 };
```

**状态转换**：

```
phase: idle
  → [点击"开始游戏"] → loading（拉取歌曲池）
  → [加载完成] → playing（第1首）

phase: playing
  → [用户填满所有格子，判断正确]  → feedbackType='correct',  phase='roundEnd'
  → [用户填满所有格子，判断错误，wrongAttempts=0] → feedbackType='wrong-retry'
      → [650ms后自动清空] → feedbackType=null（继续playing，wrongAttempts=1）
  → [用户再次填满，判断错误，wrongAttempts=1] → feedbackType='wrong-revealed', phase='roundEnd'

phase: roundEnd
  → [用户点击"下一首"] → playing（下一首）或 gameEnd（第10首后）

phase: gameEnd
  → [用户点击"再来一局"] → idle（重置）
```

### 5.3 备选字池生成逻辑

```javascript
// 参考 CeleGuess generateCharPool
function generateCharPool(currentSong, allSongs, poolSize = 24) {
  const songName = currentSong.name;

  // 1. 正确字（歌名拆分为单字数组）
  const correctChars = [...new Set(songName.split(''))];

  // 2. 干扰字：从其他歌名中取字，同为中文
  const distractors = new Set();
  const otherSongs = allSongs.filter(s => s.id !== currentSong.id);
  // 打乱后逐首取字，直到凑够 poolSize
  shuffleArray(otherSongs).forEach(song => {
    song.name.split('').forEach(char => {
      if (!correctChars.includes(char)) distractors.add(char);
    });
  });

  // 3. 合并并打乱
  const pool = [...correctChars, ...Array.from(distractors)].slice(0, poolSize);
  return shuffleArray(pool);
}
```

### 5.4 音频控制关键逻辑

```javascript
// 限制播放时长
audio.addEventListener('timeupdate', () => {
  const maxTime = DIFFICULTY_TIME[gameState.config.difficulty];
  if (audio.currentTime >= maxTime) {
    audio.pause();
  }
});

// 重播按钮：从头开始，但仍受难度时长限制
function replayAudio() {
  audio.currentTime = 0;
  audio.play();
}

// 第1次答错后：震动动画结束（650ms）后清空格子并重播
function onWrongRetryAnimationEnd() {
  gameState.round.slots = [];
  gameState.round.usedPoolIndices = [];
  gameState.feedbackType = null;
  replayAudio();
  renderGame();
}
```

### 5.4 localStorage 历史分数

```javascript
const STORAGE_KEY = 'songguess_highscore';

function getHighScore() {
  return parseInt(localStorage.getItem(STORAGE_KEY) || '0');
}

function updateHighScore(score) {
  const current = getHighScore();
  if (score > current) {
    localStorage.setItem(STORAGE_KEY, score.toString());
    return true; // 新纪录
  }
  return false;
}
```

---

## 六、后端 API 扩展规划

在现有 `server.js` 基础上新增一个游戏专用接口：

### `GET /api/game/songs`

**请求参数**：

| 参数 | 类型 | 说明 | 示例 |
|-----|------|------|------|
| `lang` | string | 语言 | `mandarin`/`cantonese`/`minnan`/`any` |
| `era` | string | 年代范围 | `2000-2009`/`any` |
| `popularity` | string | 热度 | `high`/`low`/`any` |
| `artist` | string | 歌手（可选） | `周杰伦` |
| `count` | number | 返回歌曲数量 | `50`（默认） |

**响应结构**：

```json
{
  "songs": [
    {
      "id": "spotify_track_id",
      "name": "七里香",
      "artists": ["周杰伦"],
      "album": "七里香",
      "coverUrl": "https://...",
      "previewUrl": "https://...",
      "popularity": 82,
      "year": 2004
    }
  ],
  "total": 50
}
```

**服务端处理逻辑**：

```javascript
// 根据参数构建多个搜索词
// 并发请求多次 Spotify search（使用 Promise.all）
// 合并结果，按 preview_url 存在过滤
// 按 popularity 范围过滤
// 去重（by track id）
// 随机打乱
// 返回前 count 首
```

---

## 七、移动端适配要点

1. **触控区域**：选项按钮最小高度 56px，满足 iOS/Android 触控标准
2. **视口**：`<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">` 防止双击缩放
3. **音频自动播放**：移动端需用户手势触发，游戏流程设计为"点击开始"后触发第一次播放
4. **横屏适配**：限制为竖屏为主（`@media (orientation: landscape)` 显示提示）
5. **字体大小**：最小 14px，避免 iOS 自动放大
6. **safe area**：使用 `env(safe-area-inset-bottom)` 适配刘海/圆角屏
7. **防误触**：答题后立即禁用其他选项按钮，防止多次点击

---

## 八、开发阶段规划

### Phase 1：骨架搭建
- [ ] 创建 `public/game/` 目录及基础文件
- [ ] 实现开始页面（筛选 + 难度选择 UI）
- [ ] 实现 SPA 视图切换机制

### Phase 2：后端 API
- [ ] 在 `server.js` 新增 `/api/game/songs` 接口
- [ ] 实现语言/年代/热度/歌手筛选逻辑
- [ ] 测试各筛选组合的 Spotify 搜索效果

### Phase 3：游戏核心逻辑
- [ ] 歌曲池加载与状态初始化
- [ ] 音频播放与时长限制
- [ ] 备选词生成（4选1）
- [ ] 答题状态机（2次机会逻辑）
- [ ] 分数计算

### Phase 4：UI 精化
- [ ] 专辑封面模糊揭晓动画
- [ ] 答题反馈动画（震动、颜色变化）
- [ ] 进度条与计时显示
- [ ] 分数弹跳动画

### Phase 5：结算与存储
- [ ] 结算页面（本局得分 + 历史最高）
- [ ] localStorage 历史最高分
- [ ] 新纪录庆祝动画
- [ ] 10首回顾列表

### Phase 6：优化与测试
- [ ] 移动端适配测试（iOS Safari / Android Chrome）
- [ ] 无 preview_url 歌曲的容错处理
- [ ] 网络错误处理与重试
- [ ] 加载动画与骨架屏

---

## 九、已知限制与解决方案

| 限制 | 说明 | 解决方案 |
|-----|------|---------|
| Spotify preview 并非所有歌曲都有 | 部分歌曲无 30s 试听片段 | 筛选时过滤掉 `preview_url` 为空的歌曲 |
| Spotify 无语言字段 | API 不直接提供语言分类 | 通过关键词搜索策略（playlist/genre/关键词）近似实现 |
| 移动端自动播放限制 | iOS/Android 需用户手势触发音频 | 设计"点击开始"按钮触发首次播放 |
| Spotify market 差异 | 部分地区歌曲不可用 | 使用 `market=TW` 覆盖华语歌曲 |
| Client Credentials 无用户上下文 | 无法获取用户个人数据 | 仅使用公开数据（search/albums/tracks），完全满足需求 |

---

## 十、参考 CeleGuess 的复用模式

CeleGuess 位于 `/Users/yangkai/www/AI_TEST/cele-guess/CeleGuess`，为本游戏提供以下可复用的设计模式：

### 10.1 评分系统（直接复用逻辑）

```javascript
// 来自 CeleGuess/src/utils/scoreGame.ts
const SCORE_FIRST_TRY = 3;
const SCORE_SECOND_TRY = 1;

function getScoreForAttempts(wrongAttempts, isCorrect) {
  if (!isCorrect) return 0;
  if (wrongAttempts === 0) return 3; // 第一次猜对
  if (wrongAttempts === 1) return 1; // 第二次猜对
  return 0;
}
```

### 10.2 游戏阶段状态机（参考）

CeleGuess 使用清晰的 phase 枚举：

```
idle → playing → roundEnd → playing（循环10次）→ gameEnd
```

本游戏直接复用此模式：

```javascript
// phase: 'idle' | 'loading' | 'playing' | 'roundEnd' | 'gameEnd'
// feedbackType: null | 'correct' | 'wrong-retry' | 'wrong-revealed'
```

### 10.3 答题反馈动画（CSS 直接借鉴）

```css
/* 错误时按钮震动 */
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  15% { transform: translateX(-6px); }
  30% { transform: translateX(6px); }
  45% { transform: translateX(-6px); }
  60% { transform: translateX(6px); }
  75% { transform: translateX(-4px); }
  90% { transform: translateX(4px); }
}

/* 正确时按钮弹出 */
@keyframes correctPop {
  0%   { transform: scale(1); }
  40%  { transform: scale(1.15); }
  70%  { transform: scale(0.95); }
  100% { transform: scale(1); }
}

/* 得分浮动动画 */
@keyframes scoreFloat {
  0%   { opacity: 0; transform: translateX(-50%) translateY(0) scale(0.6); }
  20%  { opacity: 1; transform: translateX(-50%) translateY(-10px) scale(1.2); }
  60%  { opacity: 1; transform: translateX(-50%) translateY(-30px) scale(1); }
  100% { opacity: 0; transform: translateX(-50%) translateY(-60px) scale(0.9); }
}

/* 轮次结果弹窗滑入 */
@keyframes slideUp {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}
```

### 10.4 字符池按钮与格子状态（直接复用 CeleGuess 模式）

本游戏与 CeleGuess 的交互几乎完全相同：字符池 → 点击填入格子 → 自动提交。

**字符池按钮状态**（对应 CeleGuess `CharacterPool`）：

| 状态 | 样式 | 对应 CeleGuess |
|-----|------|--------------|
| 默认 | 白底，可点击 | char-btn normal |
| 已使用 | 半透明 + 删除线，不可点击 | char-btn-used |
| 反馈中锁定 | opacity 0.55，不可点击 | char-btn-locked |
| 按下 | scale(0.88)，绿色 | :active 效果 |

**歌名格子状态**（对应 CeleGuess `NameSlots`）：

| 状态 | 样式 | 对应 CeleGuess |
|-----|------|--------------|
| 空格 | 虚线边框 | slot-empty |
| 已填字 | 实线蓝色边框 | slot-filled |
| 正确 | 绿色背景 + correctPop 动画 | slot-correct |
| 错误-可重试 | 红色背景 + shake 动画（650ms）| slot-wrong + slot-shake |
| 错误-揭示 | 橙色背景，显示正确字 | slot-revealed |

**布局差异**：CeleGuess 字符池是 `grid 9列`，本游戏可用 `grid 7列` 或 `flex wrap` 适配歌名汉字大小。

### 10.5 历史最高分（直接复用）

```javascript
// CeleGuess 使用 localStorage 存储高分，本游戏同样适用
const HIGH_SCORE_KEY = 'songguess_highscore';

function getHighScore() {
  return parseInt(localStorage.getItem(HIGH_SCORE_KEY) || '0');
}

function updateHighScore(score) {
  if (score > getHighScore()) {
    localStorage.setItem(HIGH_SCORE_KEY, score.toString());
    return true; // 新纪录
  }
  return false;
}
```

### 10.6 结算页面结构（参考 CeleGuess gameEnd 视图）

CeleGuess 结算页展示：
- 最终得分（72px 大字）
- 正确数 / 总数
- 满分参考（30分）
- 历史最高分标识
- 每轮回顾列表（对/错 + 得分）
- "再来一局" + "返回首页" 按钮

本游戏在此基础上增加：每首歌的专辑封面缩略图 + "再听一次" 功能。

---

## 十一、参考资源

- 现有 Spotify Demo：`/spotify-demo/server.js`（Token 管理、API 封装可直接复用）
- CeleGuess 游戏：`/Users/yangkai/www/AI_TEST/cele-guess/CeleGuess/src/`（评分逻辑、动画、状态机参考）
- Spotify Web API 文档：Search API、Tracks API
- 音频控制：HTML5 `<audio>` API + timeupdate 事件
- 参考游戏机制：类似 Heardle（每次揭示更多内容），但本项目采用多选题形式
