require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Load local song database
const SONGS_PATH = path.join(__dirname, 'songs.json');
let songsDb = [];
try {
  songsDb = JSON.parse(fs.readFileSync(SONGS_PATH, 'utf8'));
} catch (e) {
  console.error('Failed to load songs.json:', e.message);
}

// Search songs from local DB
app.get('/api/search/tracks', (req, res) => {
  const { q, limit = 20, offset = 0 } = req.query;
  if (!q) return res.status(400).json({ error: 'Query parameter "q" is required' });
  const keyword = q.toLowerCase();
  const results = songsDb.filter(s =>
    s.title.includes(q) ||
    s.artist.toLowerCase().includes(keyword) ||
    s.pinyin.includes(keyword) ||
    s.initial.toLowerCase().includes(keyword)
  );
  const items = results.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
  res.json({ tracks: { items, total: results.length } });
});

// Game API: fetch filtered songs from local DB
app.get('/api/game/songs', (req, res) => {
  const { lang = 'any', era = 'any', artist = '', count = 50 } = req.query;

  // Era range mapping
  const eraRanges = {
    '1960-1979': [1960, 1979],
    '1980-1989': [1980, 1989],
    '1990-1999': [1990, 1999],
    '2000-2009': [2000, 2009],
    '2010-2019': [2010, 2019],
    '2020-2026': [2020, 2026],
  };

  let filtered = songsDb.filter(s => {
    if (lang !== 'any' && s.lang !== lang) return false;
    if (era !== 'any') {
      const range = eraRanges[era];
      if (range && (s.year < range[0] || s.year > range[1])) return false;
    }
    if (artist && !s.artist.includes(artist)) return false;
    return true;
  });

  // Shuffle
  for (let i = filtered.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [filtered[i], filtered[j]] = [filtered[j], filtered[i]];
  }

  // Normalize to game-compatible shape
  const songs = filtered.slice(0, parseInt(count)).map(s => ({
    id: String(s.id),
    name: s.title,
    artists: [s.artist],
    album: '',
    coverUrl: '',
    previewUrl: '',
    popularity: null,
    year: s.year,
    lang: s.lang,
    initial: s.initial,
    pinyin: s.pinyin,
  }));

  res.json({ songs, total: songs.length });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Spotify Demo server running at http://localhost:${PORT}`);
});
