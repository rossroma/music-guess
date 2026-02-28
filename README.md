# 🎵 猜歌名游戏

基于 Spotify Web API 的移动端中文歌曲猜歌游戏。收听一段时长受限的歌曲片段，从字符池中点击汉字拼出歌曲名称。

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/rossroma/music-guess&env=SPOTIFY_CLIENT_ID,SPOTIFY_CLIENT_SECRET&envDescription=Spotify%20API%20credentials%20from%20developer.spotify.com/dashboard)

## 游戏玩法

1. 设置筛选条件（年代 / 语言 / 热度 / 歌手）和难度（10 / 20 / 30 秒）
2. 收听一段歌曲片段
3. 从下方字符池中依次点击汉字，拼出歌曲名称
4. 每首歌最多两次机会：第一次答对 +3 分，第二次答对 +1 分，两次失败 +0 分
5. 10 首结束后查看总分和历史最高分

## 快速开始

### 本地运行

**1. 获取 Spotify API 凭证**

前往 [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) 创建应用，获取 `Client ID` 和 `Client Secret`。

**2. 配置环境变量**

```bash
cp .env.example .env
```

编辑 `.env`：

```
SPOTIFY_CLIENT_ID=你的ClientID
SPOTIFY_CLIENT_SECRET=你的ClientSecret
```

**3. 安装依赖并启动**

```bash
npm install
npm start
```

**4. 打开游戏**

浏览器访问 [http://localhost:3000](http://localhost:3000)

---

### 部署到 Vercel

**方法一：一键部署（推荐）**

点击上方 **Deploy with Vercel** 按钮，按提示填入两个环境变量即可。

**方法二：CLI 部署**

```bash
npm install -g vercel
vercel
```

按提示操作，然后在 Vercel 控制台的项目设置 → Environment Variables 中添加：

| 变量名 | 说明 |
|--------|------|
| `SPOTIFY_CLIENT_ID` | Spotify 应用的 Client ID |
| `SPOTIFY_CLIENT_SECRET` | Spotify 应用的 Client Secret |

重新部署后即可访问。

## 技术栈

- **后端**：Node.js + Express
- **前端**：原生 HTML / CSS / JavaScript（无框架）
- **API**：Spotify Web API（Client Credentials Flow）
- **部署**：Vercel Serverless

## 项目结构

```
├── server.js          # Express 服务端 + Spotify API 封装
├── vercel.json        # Vercel 部署配置
├── public/
│   ├── index.html     # 游戏主页（SPA）
│   ├── game.css       # 游戏样式（移动端优先，深色主题）
│   └── game.js        # 游戏逻辑（状态机 + 音频控制）
└── .env.example       # 环境变量模板
```
