// ===== Constants =====
const DIFFICULTY_TIME = { easy: 30, medium: 20, hard: 10 };
const TOTAL_ROUNDS = 10;
const POOL_SIZE = 24;
const HIGH_SCORE_KEY = 'songguess_highscore';

// ===== State =====
const gameState = {
  config: {
    lang: 'any',
    era: 'any',
    artist: '',
    difficulty: 'medium',
  },
  phase: 'idle', // idle | loading | playing | roundEnd | gameEnd
  feedbackType: null, // null | correct | wrong-retry | wrong-revealed
  songs: [],
  currentIndex: 0,
  round: {
    wrongAttempts: 0,
    charPool: [],       // { char, poolIndex, used }
    slots: [],          // Array of char strings (or null)
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

function isChinese(char) {
  return /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(char);
}

function splitSongName(name) {
  // Split into individual characters (treat as Chinese chars or other units)
  return [...name];
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
  el.style.color = points === 3 ? '#1DB954' : points === 1 ? '#f4b400' : '#888';
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

// ===== Config UI =====
function initConfigUI() {
  // Single-select chip groups
  ['era-group', 'lang-group', 'difficulty-group'].forEach(groupId => {
    const group = document.getElementById(groupId);
    group.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        group.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
      });
    });
  });

  document.getElementById('start-btn').addEventListener('click', onStartGame);
}

function getConfig() {
  return {
    lang: document.querySelector('#lang-group .chip.active')?.dataset.value || 'any',
    era: document.querySelector('#era-group .chip.active')?.dataset.value || 'any',
    artist: document.getElementById('artist-input').value.trim(),
    difficulty: document.querySelector('#difficulty-group .chip.active')?.dataset.value || 'medium',
  };
}

// ===== Game Start =====
async function onStartGame() {
  gameState.config = getConfig();
  gameState.totalScore = 0;
  gameState.currentIndex = 0;
  gameState.history = [];
  gameState.phase = 'loading';

  showView('loading');
  document.getElementById('loading-sub').textContent = '搜索歌曲中，请稍候…';

  try {
    const songs = await fetchSongs();
    if (songs.length < 5) {
      document.getElementById('loading-sub').textContent =
        `仅找到 ${songs.length} 首歌曲，请放宽筛选条件后重试。`;
      setTimeout(() => {
        gameState.phase = 'idle';
        showView('start');
      }, 2500);
      return;
    }

    gameState.songs = shuffle(songs).slice(0, TOTAL_ROUNDS);
    gameState.phase = 'playing';
    startRound();
  } catch (e) {
    console.error(e);
    document.getElementById('loading-sub').textContent = '加载失败，请检查网络连接。';
    setTimeout(() => {
      gameState.phase = 'idle';
      showView('start');
    }, 2500);
  }
}

async function fetchSongs() {
  const { lang, era, artist } = gameState.config;
  const params = new URLSearchParams({ lang, era, count: '80' });
  if (artist) params.set('artist', artist);
  const res = await fetch(`/api/game/songs?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.songs || [];
}

// ===== Round Management =====
function startRound() {
  const song = gameState.songs[gameState.currentIndex];
  gameState.round = {
    wrongAttempts: 0,
    charPool: generateCharPool(song, gameState.songs),
    slots: new Array(splitSongName(song.name).length).fill(null),
  };
  gameState.feedbackType = null;

  showView('game');
  renderGameHeader();
  renderCover(true);
  renderSlots();
  renderCharPool();
  hideNextSection();
  startAudio(song.previewUrl);
}

function generateCharPool(currentSong, allSongs) {
  const chars = splitSongName(currentSong.name);
  const correctSet = new Set(chars);

  // Collect distractors from other songs
  const distractors = [];
  const distractorSet = new Set(correctSet);

  const others = shuffle(allSongs.filter(s => s.id !== currentSong.id));
  for (const song of others) {
    for (const ch of splitSongName(song.name)) {
      if (!distractorSet.has(ch)) {
        distractors.push(ch);
        distractorSet.add(ch);
      }
    }
    if ([...correctSet].length + distractors.length >= POOL_SIZE) break;
  }

  // Build pool: need enough correct chars (allow repeats if song name has repeats)
  // Each char in the song name needs its own slot in the pool
  const charPoolItems = chars.map((ch, i) => ({ char: ch, id: `correct-${i}` }));

  // Add distractors up to POOL_SIZE
  const needed = Math.max(0, POOL_SIZE - charPoolItems.length);
  distractors.slice(0, needed).forEach((ch, i) => {
    charPoolItems.push({ char: ch, id: `distract-${i}` });
  });

  return shuffle(charPoolItems);
}

// ===== Audio =====
let audioTimeUpdateHandler = null;

function startAudio(previewUrl) {
  audio.src = previewUrl;
  audio.currentTime = 0;

  const maxTime = DIFFICULTY_TIME[gameState.config.difficulty];

  if (audioTimeUpdateHandler) {
    audio.removeEventListener('timeupdate', audioTimeUpdateHandler);
  }

  audioTimeUpdateHandler = () => {
    if (audio.currentTime >= maxTime) {
      audio.pause();
      updatePlayStatus('播放完毕，点击重播再听一次');
    }
    updateProgressBar();
  };

  audio.addEventListener('timeupdate', audioTimeUpdateHandler);
  audio.addEventListener('ended', () => updatePlayStatus('播放完毕'), { once: true });

  audio.play().then(() => {
    updatePlayStatus('正在播放…');
  }).catch(() => {
    updatePlayStatus('点击重播按钮开始');
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
  document.getElementById('round-progress').textContent =
    `第 ${gameState.currentIndex + 1} / ${TOTAL_ROUNDS} 首`;
  document.getElementById('score-display').textContent = `得分: ${gameState.totalScore}`;
}

function renderCover(blurred) {
  const song = gameState.songs[gameState.currentIndex];
  const img = document.getElementById('album-cover');
  const overlay = document.getElementById('cover-overlay');

  img.src = song.coverUrl || '';
  if (blurred) {
    img.classList.add('blurred');
    overlay.classList.remove('hidden');
  } else {
    img.classList.remove('blurred');
    overlay.classList.add('hidden');
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

    // Apply feedback state
    if (gameState.feedbackType === 'correct') {
      el.classList.remove('filled');
      el.classList.add('correct');
    } else if (gameState.feedbackType === 'wrong-retry') {
      el.classList.remove('filled');
      el.classList.add('wrong');
    } else if (gameState.feedbackType === 'wrong-revealed') {
      el.classList.remove('filled');
      el.classList.add('revealed');
      // Show correct answer char
      const song = gameState.songs[gameState.currentIndex];
      const correctChars = splitSongName(song.name);
      el.textContent = correctChars[i] || '';
    }

    container.appendChild(el);
  });
}

function renderCharPool() {
  const container = document.getElementById('char-pool');
  container.innerHTML = '';
  const locked = gameState.feedbackType !== null;

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

  // Find first empty slot
  const emptyIdx = gameState.round.slots.findIndex(s => s === null);
  if (emptyIdx === -1) return;

  // Fill slot
  gameState.round.slots[emptyIdx] = item.char;
  // Mark pool item as used with reference to slot
  item.used = true;
  item.slotIndex = emptyIdx;

  renderSlots();
  renderCharPool();

  // Check if all filled
  if (gameState.round.slots.every(s => s !== null)) {
    submitAnswer();
  }
}

function onSlotClick(slotIndex) {
  if (gameState.phase !== 'playing' || gameState.feedbackType) return;
  const char = gameState.round.slots[slotIndex];
  if (!char) return;

  // Find the pool item that filled this slot
  const poolItem = gameState.round.charPool.find(
    item => item.used && item.slotIndex === slotIndex
  );

  gameState.round.slots[slotIndex] = null;
  if (poolItem) {
    poolItem.used = false;
    delete poolItem.slotIndex;
  }

  // Shift remaining slots left (collapse gaps)
  // Actually: don't collapse, just leave the slot empty
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
    gameState.history.push({
      song,
      score: points,
      wrongAttempts: gameState.round.wrongAttempts,
    });

    renderSlots();
    renderCharPool();
    renderGameHeader();
    renderCover(false);
    showFeedbackBanner('correct', points);
    showNextSection();
    floatScore(points);
  } else if (gameState.round.wrongAttempts === 0) {
    // First wrong: shake + auto clear after 650ms
    gameState.round.wrongAttempts = 1;
    gameState.feedbackType = 'wrong-retry';

    renderSlots();
    renderCharPool();

    setTimeout(() => {
      // Clear slots and pool usage
      gameState.round.slots = new Array(gameState.round.slots.length).fill(null);
      gameState.round.charPool.forEach(item => {
        item.used = false;
        delete item.slotIndex;
      });
      gameState.feedbackType = null;
      renderSlots();
      renderCharPool();
      // Replay audio
      audio.currentTime = 0;
      audio.play().then(() => updatePlayStatus('正在播放…'));
    }, 650);
  } else {
    // Second wrong: reveal answer
    gameState.feedbackType = 'wrong-revealed';
    gameState.phase = 'roundEnd';
    gameState.history.push({
      song,
      score: 0,
      wrongAttempts: 2,
    });

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
  const section = document.getElementById('next-section');
  section.style.display = 'flex';
}

function hideNextSection() {
  const section = document.getElementById('next-section');
  section.style.display = 'none';
  document.getElementById('feedback-banner').textContent = '';
  document.getElementById('feedback-banner').className = 'feedback-banner';
}

function floatScore(points) {
  const scoreEl = document.getElementById('score-display');
  const rect = scoreEl.getBoundingClientRect();
  showScoreFloat(points, rect.left + rect.width / 2, rect.top);
}

// ===== Next Button =====
document.getElementById('next-btn').addEventListener('click', onNextRound);

function onNextRound() {
  audio.pause();
  gameState.currentIndex++;

  if (gameState.currentIndex >= gameState.songs.length) {
    endGame();
    return;
  }

  gameState.phase = 'playing';
  startRound();
}

// ===== End Game =====
function endGame() {
  gameState.phase = 'gameEnd';
  audio.pause();

  const isNewRecord = updateHighScore(gameState.totalScore);

  document.getElementById('final-score').textContent = gameState.totalScore;
  document.getElementById('high-score-display').textContent = getHighScore();

  const recordBanner = document.getElementById('new-record-banner');
  if (isNewRecord) {
    recordBanner.classList.remove('hidden');
  } else {
    recordBanner.classList.add('hidden');
  }

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
  gameState.config = getConfig(); // keep same config
  gameState.totalScore = 0;
  gameState.currentIndex = 0;
  gameState.history = [];
  gameState.phase = 'loading';
  showView('loading');
  document.getElementById('loading-sub').textContent = '搜索歌曲中，请稍候…';

  fetchSongs().then(songs => {
    if (songs.length < 5) {
      document.getElementById('loading-sub').textContent = '歌曲不足，请修改筛选条件。';
      setTimeout(() => showView('start'), 2000);
      return;
    }
    gameState.songs = shuffle(songs).slice(0, TOTAL_ROUNDS);
    gameState.phase = 'playing';
    startRound();
  }).catch(() => {
    document.getElementById('loading-sub').textContent = '加载失败，请检查网络。';
    setTimeout(() => showView('start'), 2000);
  });
});

document.getElementById('change-filter-btn').addEventListener('click', () => {
  gameState.phase = 'idle';
  showView('start');
});

// ===== Init =====
initConfigUI();
showView('start');
