require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

<<<<<<< HEAD
const ITUNES_BASE = 'https://itunes.apple.com';

// Language → search terms mapping
const LANG_TERMS = {
  mandarin: ['华语流行', '国语流行', '普通话', '华语', '国语'],
  cantonese: ['粤语流行', '粤语', 'Cantopop'],
  minnan: ['闽南语', '台语'],
  any: ['华语', '粤语', '国语', '中文歌'],
};

// Era → release year range (iTunes uses attribute=releaseYearTerm but it's unreliable;
// we filter client-side after fetching)
const ERA_RANGE = {
  '1960-1979': [1960, 1979],
  '1980-1989': [1980, 1989],
  '1990-1999': [1990, 1999],
  '2000-2009': [2000, 2009],
  '2010-2019': [2010, 2019],
  '2020-2025': [2020, 2025],
  any: null,
};

async function itunesSearch(term, limit = 50, country = 'TW') {
  const url = `${ITUNES_BASE}/search?` + new URLSearchParams({
    term,
    entity: 'song',
    media: 'music',
    limit: String(limit),
    country,
    lang: 'zh_tw',
  });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`iTunes API error: ${res.status}`);
  return res.json();
}

// Game API: fetch filtered songs for guessing game
app.get('/api/game/songs', async (req, res) => {
  try {
    const { lang = 'any', era = 'any', popularity = 'any', artist = '', count = 50 } = req.query;

    const terms = LANG_TERMS[lang] || LANG_TERMS.any;
    const eraRange = ERA_RANGE[era] || null;

    // Build search terms
    const queries = [];
    if (artist) {
      // Artist-specific searches combined with language terms
      terms.slice(0, 2).forEach(t => queries.push(`${artist} ${t}`));
      queries.push(artist);
    } else {
      terms.slice(0, 4).forEach(t => queries.push(t));
    }

    // Fire all queries in parallel
    const results = await Promise.all(
      queries.map(q => itunesSearch(q, 50).catch(() => null))
    );

    const trackMap = new Map();
    const hasChinese = /[\u4e00-\u9fff\u3400-\u4dbf]/;

    for (const result of results) {
      if (!result) continue;
      for (const track of result.results || []) {
        if (!track.previewUrl) continue;
        if (trackMap.has(track.trackId)) continue;
        if (!hasChinese.test(track.trackName)) continue;

        const year = track.releaseDate
          ? parseInt(track.releaseDate.slice(0, 4))
          : null;

        // Era filter
        if (eraRange && year) {
          if (year < eraRange[0] || year > eraRange[1]) continue;
        }

        // Popularity proxy: trackCount not available; skip low-quality entries
        // iTunes doesn't expose a popularity score, so we skip this filter

        trackMap.set(track.trackId, {
          id: String(track.trackId),
          name: track.trackName,
          artists: [track.artistName],
          album: track.collectionName || '',
          coverUrl: (track.artworkUrl100 || '').replace('100x100', '300x300'),
          previewUrl: track.previewUrl,
          year,
        });
      }
    }

    const all = Array.from(trackMap.values());
    // Shuffle
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }

    const songs = all.slice(0, parseInt(count));
    res.json({ songs, total: songs.length });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
=======
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
>>>>>>> main
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
