const API_BASE = '/api';

let currentType = 'tracks';
let currentQuery = '';
let audio = document.getElementById('audioEl');

// Elements
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const resultsEl = document.getElementById('results');
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error');
const playerEl = document.getElementById('player');
const playerCover = document.getElementById('playerCover');
const playerTitle = document.getElementById('playerTitle');
const playerArtist = document.getElementById('playerArtist');
const playPauseBtn = document.getElementById('playPauseBtn');
const playIcon = document.getElementById('playIcon');
const pauseIcon = document.getElementById('pauseIcon');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const currentTimeEl = document.getElementById('currentTime');
const durationEl = document.getElementById('duration');
const volumeSlider = document.getElementById('volumeSlider');
const closePlayer = document.getElementById('closePlayer');

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentType = tab.dataset.type;
    if (currentQuery) search();
  });
});

// Search trigger
searchBtn.addEventListener('click', () => {
  currentQuery = searchInput.value.trim();
  if (currentQuery) search();
});

searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    currentQuery = searchInput.value.trim();
    if (currentQuery) search();
  }
});

async function search() {
  showLoading();
  try {
    const res = await fetch(`${API_BASE}/search/${currentType}?q=${encodeURIComponent(currentQuery)}&limit=24`);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Search failed');
    }
    const data = await res.json();
    renderResults(data);
  } catch (err) {
    showError(err.message);
  }
}

function showLoading() {
  loadingEl.classList.remove('hidden');
  errorEl.classList.add('hidden');
  resultsEl.innerHTML = '';
}

function showError(msg) {
  loadingEl.classList.add('hidden');
  errorEl.classList.remove('hidden');
  errorEl.textContent = `错误: ${msg}`;
}

function hideLoading() {
  loadingEl.classList.add('hidden');
  errorEl.classList.add('hidden');
}

function renderResults(data) {
  hideLoading();
  resultsEl.innerHTML = '';

  if (currentType === 'tracks') {
    const items = data.tracks && data.tracks.items;
    if (!items || items.length === 0) {
      resultsEl.innerHTML = '<div class="loading">没有找到结果</div>';
      return;
    }
    const list = document.createElement('div');
    list.className = 'track-list';
    items.forEach((track, idx) => renderTrackItem(track, idx + 1, list));
    resultsEl.appendChild(list);

  } else if (currentType === 'albums') {
    const items = data.albums && data.albums.items;
    if (!items || items.length === 0) {
      resultsEl.innerHTML = '<div class="loading">没有找到结果</div>';
      return;
    }
    const grid = document.createElement('div');
    grid.className = 'results-grid';
    items.forEach(album => renderAlbumCard(album, grid));
    resultsEl.appendChild(grid);

  } else if (currentType === 'playlists') {
    const items = data.playlists && data.playlists.items;
    if (!items || items.length === 0) {
      resultsEl.innerHTML = '<div class="loading">没有找到结果</div>';
      return;
    }
    const grid = document.createElement('div');
    grid.className = 'results-grid';
    items.forEach(playlist => renderPlaylistCard(playlist, grid));
    resultsEl.appendChild(grid);

  } else if (currentType === 'artists') {
    const items = data.artists && data.artists.items;
    if (!items || items.length === 0) {
      resultsEl.innerHTML = '<div class="loading">没有找到结果</div>';
      return;
    }
    const grid = document.createElement('div');
    grid.className = 'results-grid';
    items.forEach(artist => renderArtistCard(artist, grid));
    resultsEl.appendChild(grid);
  }
}

function getImage(images, fallback = '') {
  if (images && images.length > 0) return images[0].url;
  return fallback;
}

function renderTrackItem(track, num, container) {
  const item = document.createElement('div');
  item.className = 'track-item';
  const cover = getImage(track.album && track.album.images);
  const artist = track.artists ? track.artists.map(a => a.name).join(', ') : '未知歌手';
  const hasPreview = !!track.preview_url;

  item.innerHTML = `
    <span class="track-num">${num}</span>
    <img class="track-cover" src="${cover}" alt="cover" onerror="this.style.visibility='hidden'" />
    <div class="track-info">
      <div class="track-name">${escHtml(track.name)}</div>
      <div class="track-artist">${escHtml(artist)}</div>
    </div>
    ${hasPreview
      ? '<span class="track-preview-icon">试听</span>'
      : '<span class="no-preview">无试听</span>'}
  `;

  if (hasPreview) {
    item.addEventListener('click', () => playTrack(track));
    item.style.cursor = 'pointer';
  }

  container.appendChild(item);
}

function renderAlbumCard(album, container) {
  const card = document.createElement('div');
  card.className = 'card';
  const cover = getImage(album.images);
  const artist = album.artists ? album.artists.map(a => a.name).join(', ') : '未知歌手';

  card.innerHTML = `
    <img class="card-img" src="${cover}" alt="${escHtml(album.name)}" onerror="this.style.visibility='hidden'" />
    <div class="card-title">${escHtml(album.name)}</div>
    <div class="card-sub">${escHtml(artist)}</div>
    <div class="card-play-btn">
      <svg viewBox="0 0 24 24" fill="black" width="20" height="20"><path d="M8 5v14l11-7z"/></svg>
    </div>
  `;

  card.addEventListener('click', () => loadAlbumTracks(album.id, album.name, cover));
  container.appendChild(card);
}

function renderPlaylistCard(playlist, container) {
  const card = document.createElement('div');
  card.className = 'card';
  const cover = getImage(playlist.images);

  card.innerHTML = `
    <img class="card-img" src="${cover}" alt="${escHtml(playlist.name)}" onerror="this.style.visibility='hidden'" />
    <div class="card-title">${escHtml(playlist.name)}</div>
    <div class="card-sub">${escHtml(playlist.owner ? playlist.owner.display_name : '')}</div>
    <div class="card-play-btn">
      <svg viewBox="0 0 24 24" fill="black" width="20" height="20"><path d="M8 5v14l11-7z"/></svg>
    </div>
  `;

  card.addEventListener('click', () => loadPlaylistTracks(playlist.id, playlist.name, cover));
  container.appendChild(card);
}

function renderArtistCard(artist, container) {
  const card = document.createElement('div');
  card.className = 'card';
  const cover = getImage(artist.images);

  card.innerHTML = `
    <img class="card-img circle" src="${cover}" alt="${escHtml(artist.name)}" onerror="this.style.visibility='hidden'" />
    <div class="card-title" style="text-align:center">${escHtml(artist.name)}</div>
    <div class="card-sub" style="text-align:center">歌手</div>
    <div class="card-play-btn">
      <svg viewBox="0 0 24 24" fill="black" width="20" height="20"><path d="M8 5v14l11-7z"/></svg>
    </div>
  `;

  card.addEventListener('click', () => loadArtistTopTracks(artist.id, artist.name, cover));
  container.appendChild(card);
}

async function loadAlbumTracks(albumId, albumName, cover) {
  showLoading();
  try {
    const res = await fetch(`${API_BASE}/albums/${albumId}/tracks`);
    const data = await res.json();
    hideLoading();
    showTrackPanel(albumName, cover, data.items || []);
  } catch (err) {
    showError(err.message);
  }
}

async function loadPlaylistTracks(playlistId, playlistName, cover) {
  showLoading();
  try {
    const res = await fetch(`${API_BASE}/playlists/${playlistId}/tracks`);
    const data = await res.json();
    hideLoading();
    const tracks = (data.items || []).map(item => item.track).filter(Boolean);
    showTrackPanel(playlistName, cover, tracks);
  } catch (err) {
    showError(err.message);
  }
}

async function loadArtistTopTracks(artistId, artistName, cover) {
  showLoading();
  try {
    const res = await fetch(`${API_BASE}/artists/${artistId}/top-tracks`);
    const data = await res.json();
    hideLoading();
    showTrackPanel(artistName, cover, data.tracks || []);
  } catch (err) {
    showError(err.message);
  }
}

function showTrackPanel(title, cover, tracks) {
  resultsEl.innerHTML = '';

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;gap:16px;margin-bottom:24px';
  header.innerHTML = `
    <button onclick="goBack()" style="background:none;border:none;color:#fff;cursor:pointer;font-size:1.4rem;padding:4px 8px;border-radius:50%;background:#333">‹</button>
    ${cover ? `<img src="${cover}" style="width:60px;height:60px;border-radius:6px;object-fit:cover" />` : ''}
    <span style="font-size:1.2rem;font-weight:700">${escHtml(title)}</span>
  `;
  resultsEl.appendChild(header);

  if (tracks.length === 0) {
    resultsEl.innerHTML += '<div class="loading">该列表没有歌曲</div>';
    return;
  }

  const list = document.createElement('div');
  list.className = 'track-list';
  tracks.forEach((track, idx) => renderTrackItem(track, idx + 1, list));
  resultsEl.appendChild(list);
}

function goBack() {
  if (currentQuery) search();
  else resultsEl.innerHTML = '';
}

// Player
function playTrack(track) {
  if (!track.preview_url) return;

  const cover = getImage(track.album && track.album.images);
  const artist = track.artists ? track.artists.map(a => a.name).join(', ') : '未知歌手';

  playerCover.src = cover;
  playerTitle.textContent = track.name;
  playerArtist.textContent = artist;

  audio.src = track.preview_url;
  audio.volume = parseFloat(volumeSlider.value);
  audio.play();
  playerEl.classList.remove('hidden');
  setPlayingState(true);
}

function setPlayingState(playing) {
  if (playing) {
    playIcon.classList.add('hidden');
    pauseIcon.classList.remove('hidden');
  } else {
    playIcon.classList.remove('hidden');
    pauseIcon.classList.add('hidden');
  }
}

playPauseBtn.addEventListener('click', () => {
  if (audio.paused) {
    audio.play();
    setPlayingState(true);
  } else {
    audio.pause();
    setPlayingState(false);
  }
});

audio.addEventListener('timeupdate', () => {
  if (!audio.duration) return;
  const pct = (audio.currentTime / audio.duration) * 100;
  progressFill.style.width = pct + '%';
  currentTimeEl.textContent = formatTime(audio.currentTime);
});

audio.addEventListener('loadedmetadata', () => {
  durationEl.textContent = formatTime(audio.duration);
});

audio.addEventListener('ended', () => {
  setPlayingState(false);
  progressFill.style.width = '0%';
  currentTimeEl.textContent = '0:00';
});

progressBar.addEventListener('click', e => {
  if (!audio.duration) return;
  const rect = progressBar.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  audio.currentTime = pct * audio.duration;
});

volumeSlider.addEventListener('input', () => {
  audio.volume = parseFloat(volumeSlider.value);
});

closePlayer.addEventListener('click', () => {
  audio.pause();
  audio.src = '';
  playerEl.classList.add('hidden');
  setPlayingState(false);
});

function formatTime(secs) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
