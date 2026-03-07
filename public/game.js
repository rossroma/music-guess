// ===== Constants =====
const DIFFICULTY_TIME = { easy: 30, medium: 20, hard: 10 };
const TOTAL_ROUNDS = 10;
const POOL_SIZE = 24;
const HIGH_SCORE_KEY = 'songguess_highscore';

// Silent WAV (44 bytes) used to unlock the audio element on user gesture
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

// ===== State =====
const gameState = {
  config: {
    lang: 'any',
    era: 'any',
    artist: '',
    difficulty: 'medium',
    mode: 'challenge', // challenge | casual
  },
  phase: 'idle', // idle | loading | playing | roundEnd | gameEnd
  feedbackType: null,
  candidates: [],     // Local song stubs (id, name, artists) — used for distractor chars
  songs: [],          // Songs enriched with iTunes data, grows lazily per round
  usedIds: new Set(), // IDs already used this game session
  prefetchPromise: null, // Promise<song|null> for the next round's song
  currentIndex: 0,
  round: {
    wrongAttempts: 0,
    charPool: [],
    slots: [],
  },
  totalScore: 0,
  history: [],
};

// ===== DOM refs =====
const views = {
  start: document.getElementById('view-start'),
  loading: document.getElementById('view-loading'),
  game: document.getElementById('view-game'),
  result: document.getElementById('view-result'),
};
const audio = document.getElementById('game-audio');

// ===== Helpers =====
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Tokenize a song name into units for slot/pool display:
// - Each Chinese/CJK character becomes its own token
// - Consecutive ASCII letters/digits form a single word token
// - Spaces and punctuation are separators (dropped)
function splitSongName(name) {
  const tokens = [];
  let i = 0;
  while (i < name.length) {
    const ch = name[i];
    if (/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u20000-\u2a6df]/.test(ch)) {
      tokens.push(ch);
      i++;
    } else if (/[a-zA-Z0-9]/.test(ch)) {
      let word = '';
      while (i < name.length && /[a-zA-Z0-9]/.test(name[i])) {
        word += name[i];
        i++;
      }
      tokens.push(word);
    } else {
      i++;
    }
  }
  return tokens;
}

// Returns 'zh' for a single Chinese character, 'en' for an ASCII word, 'other' otherwise
function classifyToken(token) {
  if (/^[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]$/.test(token)) return 'zh';
  if (/^[a-zA-Z0-9]+$/.test(token)) return 'en';
  return 'other';
}

function getHighScore() {
  return parseInt(localStorage.getItem(HIGH_SCORE_KEY) || '0');
}

function updateHighScore(score) {
  const current = getHighScore();
  if (score > current) {
    localStorage.setItem(HIGH_SCORE_KEY, score.toString());
    return true;
  }
  return false;
}

function showView(name) {
  Object.values(views).forEach(v => v.classList.remove('active'));
  views[name].classList.add('active');
}

function formatTime(secs) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function showScoreFloat(points, x, y) {
  const el = document.createElement('div');
  el.className = 'score-float';
  el.textContent = points > 0 ? `+${points}` : '+0';
  el.style.color = points === 3 ? '#FF375F' : points === 1 ? '#FF9F0A' : '#555';
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

// ===== Config UI =====
function initConfigUI() {
  ['era-group', 'lang-group', 'difficulty-group', 'mode-group'].forEach(groupId => {
    const group = document.getElementById(groupId);
    group.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        group.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
      });
    });
  });

  document.getElementById('start-btn').addEventListener('click', () => {
    unlockAudio();
    onStartGame();
  });
}

function getConfig() {
  return {
    lang: document.querySelector('#lang-group .chip.active')?.dataset.value || 'any',
    era: document.querySelector('#era-group .chip.active')?.dataset.value || 'any',
    artist: document.getElementById('artist-input').value.trim(),
    difficulty: document.querySelector('#difficulty-group .chip.active')?.dataset.value || 'medium',
    mode: document.querySelector('#mode-group .chip.active')?.dataset.value || 'challenge',
  };
}

// Play a valid silent clip within the user gesture to grant the audio element
// sticky autoplay permission for the rest of the session.
function unlockAudio() {
  audio.src = SILENT_WAV;
  audio.muted = true;
  audio.play().catch(() => {}).finally(() => {
    audio.pause();
    audio.muted = false;
    audio.src = '';
  });
}

// ===== API =====
function buildParams(extras = {}) {
  const { lang, era, artist } = gameState.config;
  const params = new URLSearchParams({ lang, era });
  if (artist) params.set('artist', artist);
  for (const [k, v] of Object.entries(extras)) params.set(k, v);
  return params;
}

// Fetch local-only song stubs (very fast, no iTunes).
async function fetchCandidates() {
  const res = await fetch(`/api/game/candidates?${buildParams()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.songs || [];
}

// Fetch one iTunes-enriched song, skipping already-used IDs.
async function fetchOneSong() {
  const exclude = [...gameState.usedIds].join(',');
  const res = await fetch(`/api/game/songs?${buildParams({ count: '1', exclude })}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const song = (data.songs || [])[0] || null;
  if (song) gameState.usedIds.add(song.id);
  return song;
}

// Kick off a background fetch for the next song so it's ready when needed.
function prefetchNext() {
  // In casual mode there's no round limit; in challenge mode stop after TOTAL_ROUNDS
  if (gameState.config.mode !== 'casual' && gameState.usedIds.size >= TOTAL_ROUNDS) return;
  gameState.prefetchPromise = fetchOneSong().catch(() => null);
}

// ===== Game Start =====
async function onStartGame() {
  gameState.config = getConfig();
  gameState.totalScore = 0;
  gameState.currentIndex = 0;
  gameState.history = [];
  gameState.songs = [];
  gameState.usedIds = new Set();
  gameState.prefetchPromise = null;
  gameState.phase = 'loading';

  const isCasual = gameState.config.mode === 'casual';

  showView('loading');
  document.getElementById('loading-sub').textContent = '搜索歌曲中，请稍候…';

  try {
    let candidates = [];
    let firstSong;

    if (isCasual) {
      // Casual mode doesn't need candidates (no char pool)
      firstSong = await fetchOneSong();
    } else {
      // Fetch candidates (instant, local only) and first song (iTunes) in parallel
      [candidates, firstSong] = await Promise.all([fetchCandidates(), fetchOneSong()]);
    }

    gameState.candidates = candidates;

    if (!firstSong) {
      document.getElementById('loading-sub').textContent = '找不到符合条件的歌曲，请放宽筛选条件后重试。';
      setTimeout(() => { gameState.phase = 'idle'; showView('start'); }, 2500);
      return;
    }

    gameState.songs.push(firstSong);
    gameState.phase = 'playing';
    startRound();

    // Pre-fetch second song while the user is playing the first
    prefetchNext();
  } catch (e) {
    console.error(e);
    document.getElementById('loading-sub').textContent = '加载失败，请检查网络连接。';
    setTimeout(() => { gameState.phase = 'idle'; showView('start'); }, 2500);
  }
}

// ===== Round Management =====
function startRound() {
  const song = gameState.songs[gameState.currentIndex];
  const isCasual = gameState.config.mode === 'casual';

  gameState.round = {
    wrongAttempts: 0,
    charPool: isCasual ? [] : generateCharPool(song),
    slots: isCasual ? [] : new Array(splitSongName(song.name).length).fill(null),
  };
  gameState.feedbackType = null;

  showView('game');
  document.getElementById('view-game').classList.toggle('casual-mode', isCasual);
  document.getElementById('exit-game-btn').style.display = isCasual ? '' : 'none';

  renderGameHeader();
  renderCover(true);

  if (isCasual) {
    setupCasualRound(song);
  } else {
    renderSlots();
    renderCharPool();
    hideNextSection();
    document.getElementById('reveal-section').style.display = 'none';
  }

  startAudio(song.previewUrl);
}

function setupCasualRound(song) {
  // Show reveal section, reset to "未查看" state
  document.getElementById('reveal-section').style.display = 'flex';
  document.getElementById('reveal-btn').style.display = '';
  document.getElementById('reveal-info').style.display = 'none';
  document.getElementById('reveal-song-name').textContent = song.name;
  document.getElementById('reveal-artist').textContent = song.artists.join(' / ');

  // Show next button immediately (no answer required), hide feedback banner
  document.getElementById('feedback-banner').style.display = 'none';
  showNextSection();
}

function onReveal() {
  renderCover(false);
  document.getElementById('reveal-btn').style.display = 'none';
  document.getElementById('reveal-info').style.display = 'flex';
}

// Uses gameState.candidates (all local songs) as the distractor source so
// distractors are always plentiful regardless of how many rounds have loaded.
// Distractor tokens are filtered by type to match the current song:
//   - Chinese song  → only Chinese character distractors
//   - English song  → only English word distractors
//   - Mixed song    → both Chinese character and English word distractors
function generateCharPool(currentSong) {
  const tokens = splitSongName(currentSong.name);
  const correctSet = new Set(tokens);

  const needsZh = tokens.some(t => classifyToken(t) === 'zh');
  const needsEn = tokens.some(t => classifyToken(t) === 'en');

  const distractors = [];
  const distractorSet = new Set(correctSet);

  const others = shuffle(gameState.candidates.filter(s => s.id !== currentSong.id));
  for (const song of others) {
    for (const token of splitSongName(song.name)) {
      if (distractorSet.has(token)) continue;
      const type = classifyToken(token);
      if (type === 'zh' && !needsZh) continue;
      if (type === 'en' && !needsEn) continue;
      if (type === 'other') continue;
      distractors.push(token);
      distractorSet.add(token);
    }
    if (correctSet.size + distractors.length >= POOL_SIZE) break;
  }

  const charPoolItems = tokens.map((token, i) => ({ char: token, id: `correct-${i}` }));
  const needed = Math.max(0, POOL_SIZE - charPoolItems.length);
  distractors.slice(0, needed).forEach((token, i) => {
    charPoolItems.push({ char: token, id: `distract-${i}` });
  });

  return shuffle(charPoolItems);
}

// ===== Audio =====
let audioTimeUpdateHandler = null;

function startAudio(previewUrl) {
  if (!previewUrl) {
    updatePlayStatus('暂无试听片段');
    return;
  }

  if (audioTimeUpdateHandler) {
    audio.removeEventListener('timeupdate', audioTimeUpdateHandler);
    audioTimeUpdateHandler = null;
  }
  audio.onerror = null;

  // Direct iTunes URL — <audio> loads cross-origin sources without CORS restrictions
  // when the crossorigin attribute is not set.
  audio.src = previewUrl;
  audio.currentTime = 0;

  const maxTime = DIFFICULTY_TIME[gameState.config.difficulty];

  audioTimeUpdateHandler = () => {
    if (audio.currentTime >= maxTime) {
      audio.pause();
      updatePlayStatus('播放完毕，点击重播再听一次');
    }
    updateProgressBar();
  };

  audio.onerror = () => {
    const err = audio.error;
    updatePlayStatus('音频加载失败，点击重播重试');
    console.error('[Audio] MediaError', err?.code, err);
  };

  audio.addEventListener('timeupdate', audioTimeUpdateHandler);
  audio.addEventListener('ended', () => updatePlayStatus('播放完毕'), { once: true });

  audio.play().then(() => {
    updatePlayStatus('正在播放…');
  }).catch((err) => {
    if (err.name === 'NotAllowedError') {
      updatePlayStatus('点击重播按钮开始');
    } else if (err.name === 'NotSupportedError') {
      updatePlayStatus('当前浏览器不支持该音频格式');
    } else {
      updatePlayStatus('播放失败，点击重播重试');
      console.error('[Audio] play() failed:', err);
    }
  });
}

function updateProgressBar() {
  const maxTime = DIFFICULTY_TIME[gameState.config.difficulty];
  const progress = Math.min(audio.currentTime / maxTime, 1) * 100;
  document.getElementById('audio-progress').style.width = progress + '%';
  document.getElementById('time-display').textContent = formatTime(Math.min(audio.currentTime, maxTime));
}

function updatePlayStatus(text) {
  document.getElementById('play-status').textContent = text;
}

document.getElementById('replay-btn').addEventListener('click', () => {
  if (gameState.phase !== 'playing') return;
  audio.currentTime = 0;
  audio.play().then(() => updatePlayStatus('正在播放…'));
});

// ===== Render =====
function renderGameHeader() {
  const isCasual = gameState.config.mode === 'casual';

  document.getElementById('round-progress').textContent = isCasual
    ? `第 ${gameState.currentIndex + 1} 首`
    : `第 ${gameState.currentIndex + 1} / ${TOTAL_ROUNDS} 首`;

  const scoreEl = document.getElementById('score-display');
  if (isCasual) {
    scoreEl.textContent = '休闲模式';
    scoreEl.style.color = 'var(--text-2)';
    scoreEl.style.fontSize = '13px';
  } else {
    scoreEl.textContent = `得分: ${gameState.totalScore}`;
    scoreEl.style.color = 'var(--accent)';
    scoreEl.style.fontSize = '';
  }
}

function renderCover(blurred) {
  const song = gameState.songs[gameState.currentIndex];
  const img = document.getElementById('album-cover');
  const overlay = document.getElementById('cover-overlay');
  const wrapper = document.querySelector('.cover-wrapper');

  img.src = song.coverUrl || '';
  if (blurred) {
    img.classList.add('blurred');
    overlay.classList.remove('hidden');
    wrapper.classList.remove('revealed');
  } else {
    img.classList.remove('blurred');
    overlay.classList.add('hidden');
    wrapper.classList.add('revealed');
  }
}

function renderSlots() {
  const container = document.getElementById('answer-slots');
  container.innerHTML = '';
  const { slots } = gameState.round;

  slots.forEach((char, i) => {
    const el = document.createElement('div');
    el.className = 'slot' + (char ? ' filled' : '');
    el.textContent = char || '';
    el.dataset.index = i;

    if (char && gameState.phase === 'playing' && !gameState.feedbackType) {
      el.addEventListener('click', () => onSlotClick(i));
    }

    if (gameState.feedbackType === 'correct') {
      el.classList.remove('filled');
      el.classList.add('correct');
    } else if (gameState.feedbackType === 'wrong-retry') {
      el.classList.remove('filled');
      el.classList.add('wrong');
    } else if (gameState.feedbackType === 'wrong-revealed') {
      el.classList.remove('filled');
      el.classList.add('revealed');
      const song = gameState.songs[gameState.currentIndex];
      el.textContent = splitSongName(song.name)[i] || '';
    }

    container.appendChild(el);
  });
}

function renderCharPool() {
  const container = document.getElementById('char-pool');
  container.innerHTML = '';
  const locked = gameState.feedbackType !== null;

  // Use flex-wrap layout when pool contains English word tokens
  const hasEn = gameState.round.charPool.some(item => classifyToken(item.char) === 'en');
  container.classList.toggle('has-en', hasEn);

  gameState.round.charPool.forEach((item, i) => {
    const btn = document.createElement('button');
    btn.className = 'char-btn';
    btn.textContent = item.char;
    btn.dataset.poolIndex = i;

    if (item.used) {
      btn.classList.add('used');
    } else if (locked) {
      btn.classList.add('locked');
    } else {
      btn.addEventListener('click', () => onCharClick(i));
    }

    container.appendChild(btn);
  });
}

// ===== Interaction =====
function onCharClick(poolIndex) {
  if (gameState.phase !== 'playing' || gameState.feedbackType) return;
  const item = gameState.round.charPool[poolIndex];
  if (item.used) return;

  const emptyIdx = gameState.round.slots.findIndex(s => s === null);
  if (emptyIdx === -1) return;

  gameState.round.slots[emptyIdx] = item.char;
  item.used = true;
  item.slotIndex = emptyIdx;

  renderSlots();
  renderCharPool();

  if (gameState.round.slots.every(s => s !== null)) {
    submitAnswer();
  }
}

function onSlotClick(slotIndex) {
  if (gameState.phase !== 'playing' || gameState.feedbackType) return;
  const char = gameState.round.slots[slotIndex];
  if (!char) return;

  const poolItem = gameState.round.charPool.find(
    item => item.used && item.slotIndex === slotIndex
  );

  gameState.round.slots[slotIndex] = null;
  if (poolItem) {
    poolItem.used = false;
    delete poolItem.slotIndex;
  }

  renderSlots();
  renderCharPool();
}

function submitAnswer() {
  const song = gameState.songs[gameState.currentIndex];
  const correctChars = splitSongName(song.name);
  const isCorrect = gameState.round.slots.every((ch, i) => ch === correctChars[i]);

  if (isCorrect) {
    const points = gameState.round.wrongAttempts === 0 ? 3 : 1;
    gameState.totalScore += points;
    gameState.feedbackType = 'correct';
    gameState.phase = 'roundEnd';
    gameState.history.push({ song, score: points, wrongAttempts: gameState.round.wrongAttempts });

    renderSlots();
    renderCharPool();
    renderGameHeader();
    renderCover(false);
    showFeedbackBanner('correct', points);
    showNextSection();
    floatScore(points);
  } else if (gameState.round.wrongAttempts === 0) {
    gameState.round.wrongAttempts = 1;
    gameState.feedbackType = 'wrong-retry';

    renderSlots();
    renderCharPool();

    setTimeout(() => {
      gameState.round.slots = new Array(gameState.round.slots.length).fill(null);
      gameState.round.charPool.forEach(item => { item.used = false; delete item.slotIndex; });
      gameState.feedbackType = null;
      renderSlots();
      renderCharPool();
      audio.currentTime = 0;
      audio.play().then(() => updatePlayStatus('正在播放…'));
    }, 650);
  } else {
    gameState.feedbackType = 'wrong-revealed';
    gameState.phase = 'roundEnd';
    gameState.history.push({ song, score: 0, wrongAttempts: 2 });

    renderSlots();
    renderCharPool();
    renderCover(false);
    showFeedbackBanner('wrong-revealed', 0);
    showNextSection();
    floatScore(0);
  }
}

function showFeedbackBanner(type, points) {
  const banner = document.getElementById('feedback-banner');
  banner.className = 'feedback-banner ' + type;

  const song = gameState.songs[gameState.currentIndex];
  const artistStr = song.artists.join(' / ');

  if (type === 'correct') {
    banner.textContent = points === 3
      ? `✓ 答对了！+${points}分   ${artistStr} - ${song.name}`
      : `✓ 第二次答对！+${points}分   ${artistStr} - ${song.name}`;
  } else if (type === 'wrong-retry') {
    banner.textContent = '✗ 答错了，再试一次！';
  } else {
    banner.textContent = `✗ 正确答案：${song.name}   ${artistStr}`;
  }
}

function showNextSection() {
  document.getElementById('next-section').style.display = 'flex';
}

function hideNextSection() {
  document.getElementById('next-section').style.display = 'none';
  const banner = document.getElementById('feedback-banner');
  banner.style.display = '';
  banner.textContent = '';
  banner.className = 'feedback-banner';
}

function floatScore(points) {
  const scoreEl = document.getElementById('score-display');
  const rect = scoreEl.getBoundingClientRect();
  showScoreFloat(points, rect.left + rect.width / 2, rect.top);
}

// ===== Next Button =====
document.getElementById('next-btn').addEventListener('click', onNextRound);

async function onNextRound() {
  audio.pause();
  gameState.currentIndex++;

  const isCasual = gameState.config.mode === 'casual';

  if (!isCasual && gameState.currentIndex >= TOTAL_ROUNDS) {
    endGame();
    return;
  }

  // Retrieve the pre-fetched song (or fetch now if not ready yet)
  let nextSong = null;

  if (gameState.prefetchPromise) {
    // Show a brief loading indicator only if the prefetch hasn't resolved yet
    const timeout = setTimeout(() => {
      document.getElementById('loading-sub').textContent = '加载下一首…';
      showView('loading');
    }, 300);

    nextSong = await gameState.prefetchPromise;
    gameState.prefetchPromise = null;
    clearTimeout(timeout);
  }

  if (!nextSong) {
    showView('loading');
    document.getElementById('loading-sub').textContent = '加载下一首…';
    nextSong = await fetchOneSong().catch(() => null);
  }

  if (!nextSong) {
    if (isCasual) {
      // No more songs available — return to start screen
      audio.pause();
      gameState.phase = 'idle';
      document.getElementById('view-game').classList.remove('casual-mode');
      showView('start');
    } else {
      endGame();
    }
    return;
  }

  gameState.songs.push(nextSong);
  gameState.phase = 'playing';
  startRound();

  // Pre-fetch the song after this one
  prefetchNext();
}

// ===== End Game =====
function endGame() {
  gameState.phase = 'gameEnd';
  audio.pause();

  const isNewRecord = updateHighScore(gameState.totalScore);

  document.getElementById('final-score').textContent = gameState.totalScore;
  document.getElementById('high-score-display').textContent = getHighScore();

  const recordBanner = document.getElementById('new-record-banner');
  recordBanner.classList.toggle('hidden', !isNewRecord);

  renderHistoryList();
  showView('result');
}

function renderHistoryList() {
  const container = document.getElementById('history-list');
  container.innerHTML = '';

  gameState.history.forEach((item, i) => {
    const el = document.createElement('div');
    el.className = 'history-item';
    el.style.animation = `slideUp 0.3s ease ${i * 0.05}s both`;

    const img = document.createElement('img');
    img.className = 'history-cover';
    img.src = item.song.coverUrl || '';
    img.alt = item.song.name;
    img.onerror = () => { img.style.display = 'none'; };

    const info = document.createElement('div');
    info.className = 'history-info';

    const songName = document.createElement('div');
    songName.className = 'history-song';
    songName.textContent = item.song.name;

    const artist = document.createElement('div');
    artist.className = 'history-artist';
    artist.textContent = item.song.artists.join(' / ');

    info.appendChild(songName);
    info.appendChild(artist);

    const score = document.createElement('div');
    score.className = `history-score s${item.score}`;
    score.textContent = `+${item.score}`;

    el.appendChild(img);
    el.appendChild(info);
    el.appendChild(score);
    container.appendChild(el);
  });
}

// ===== Result actions =====
document.getElementById('play-again-btn').addEventListener('click', () => {
  unlockAudio();
  onStartGame();
});

document.getElementById('change-filter-btn').addEventListener('click', () => {
  gameState.phase = 'idle';
  showView('start');
});

// ===== Casual Mode: Reveal & Exit =====
document.getElementById('reveal-btn').addEventListener('click', onReveal);

document.getElementById('exit-game-btn').addEventListener('click', () => {
  audio.pause();
  gameState.phase = 'idle';
  document.getElementById('view-game').classList.remove('casual-mode');
  showView('start');
});

// ===== Init =====
initConfigUI();
showView('start');
