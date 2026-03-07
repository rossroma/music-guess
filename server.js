require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const songsDb = JSON.parse(fs.readFileSync(path.join(__dirname, 'songs.json'), 'utf8'));

const ITUNES_BASE = 'https://itunes.apple.com';
const GAME_ROUNDS = 10;

const ERA_RANGE = {
  'pre-1990': [0, 1989],
  '1990-1999': [1990, 1999],
  '2000-2009': [2000, 2009],
  '2010-2019': [2010, 2019],
  '2020-2026': [2020, 2026],
};

async function itunesLookup(title, artist) {
  const url = `${ITUNES_BASE}/search?` + new URLSearchParams({
    term: `${title} ${artist}`,
    entity: 'song',
    media: 'music',
    limit: '5',
    country: 'TW',
    lang: 'zh_tw',
  });
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const match = (data.results || []).find(t => t.previewUrl && t.trackName.includes(title));
  return match || null;
}

function filterSongs(lang, era, artist) {
  const eraRange = ERA_RANGE[era] || null;
  return songsDb.filter(s => {
    if (lang !== 'any' && s.lang !== lang) return false;
    if (eraRange && (s.year < eraRange[0] || s.year > eraRange[1])) return false;
    if (artist && !s.artist.includes(artist)) return false;
    return true;
  });
}

// Append a line to logs/missing-preview.log for any song that has no iTunes match
const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'missing-preview.log');
function logMissingPreview(s, reason) {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    const line = `[${new Date().toISOString()}] ${reason.padEnd(20)} id=${String(s.id).padStart(3)} "${s.title}" — ${s.artist}\n`;
    fs.appendFileSync(LOG_FILE, line, 'utf8');
  } catch (_) { /* non-critical */ }
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Fast: local-only song stubs used as the distractor character pool on the client.
// No iTunes lookup — responds in milliseconds.
app.get('/api/game/candidates', (req, res) => {
  const { lang = 'any', era = 'any', artist = '' } = req.query;
  const filtered = filterSongs(lang, era, artist);
  res.json({
    songs: filtered.map(s => ({ id: String(s.id), name: s.title, artists: [s.artist] })),
  });
});

// Returns up to `count` songs enriched with an iTunes previewUrl.
// `exclude` is a comma-separated list of song IDs to skip (already used this game).
app.get('/api/game/songs', async (req, res) => {
  try {
    const { lang = 'any', era = 'any', artist = '', count = '1', exclude = '' } = req.query;
    const excludeIds = new Set(exclude ? exclude.split(',') : []);
    const targetCount = Math.max(1, Math.min(parseInt(count) || 1, GAME_ROUNDS));

    const pool = shuffleArray(
      filterSongs(lang, era, artist).filter(s => !excludeIds.has(String(s.id)))
    );

    const enriched = [];
    for (let i = 0; i < pool.length && enriched.length < targetCount; i += 10) {
      const batch = pool.slice(i, i + 10);
      const results = await Promise.all(
        batch.map(s => itunesLookup(s.title, s.artist).catch(() => null))
      );
      for (let j = 0; j < batch.length; j++) {
        if (enriched.length >= targetCount) break;
        const track = results[j];
        if (!track) { logMissingPreview(batch[j], 'no_itunes_match'); continue; }
        if (!track.previewUrl) { logMissingPreview(batch[j], 'no_preview_url'); continue; }
        const s = batch[j];
        enriched.push({
          id: String(s.id),
          name: s.title,
          artists: [s.artist],
          album: track.collectionName || '',
          coverUrl: (track.artworkUrl100 || '').replace('100x100', '300x300'),
          previewUrl: track.previewUrl,
          year: s.year,
          lang: s.lang,
          initial: s.initial,
          pinyin: s.pinyin,
        });
      }
    }

    res.json({ songs: enriched, total: enriched.length });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
