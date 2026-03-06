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
const songsDb = JSON.parse(fs.readFileSync(path.join(__dirname, 'songs.json'), 'utf8'));

const ITUNES_BASE = 'https://itunes.apple.com';

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
  // Find best match: track name contains the title
  const match = (data.results || []).find(t => t.previewUrl && t.trackName.includes(title));
  return match || null;
}

// Game API: filter from local songs.json, enrich with iTunes previewUrl + coverUrl
app.get('/api/game/songs', async (req, res) => {
  try {
    const { lang = 'any', era = 'any', artist = '', count = 20 } = req.query;
    const eraRange = ERA_RANGE[era] || null;

    let filtered = songsDb.filter(s => {
      if (lang !== 'any' && s.lang !== lang) return false;
      if (eraRange && (s.year < eraRange[0] || s.year > eraRange[1])) return false;
      if (artist && !s.artist.includes(artist)) return false;
      return true;
    });

    // Shuffle
    for (let i = filtered.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [filtered[i], filtered[j]] = [filtered[j], filtered[i]];
    }

    // Take more candidates than needed to account for iTunes misses
    const candidates = filtered.slice(0, parseInt(count) * 3);

    // Enrich with iTunes in parallel (batches of 10 to avoid rate limiting)
    const enriched = [];
    for (let i = 0; i < candidates.length && enriched.length < parseInt(count); i += 10) {
      const batch = candidates.slice(i, i + 10);
      const results = await Promise.all(
        batch.map(s => itunesLookup(s.title, s.artist).catch(() => null))
      );
      for (let j = 0; j < batch.length; j++) {
        if (enriched.length >= parseInt(count)) break;
        const s = batch[j];
        const track = results[j];
        enriched.push({
          id: String(s.id),
          name: s.title,
          artists: [s.artist],
          album: track ? (track.collectionName || '') : '',
          coverUrl: track ? (track.artworkUrl100 || '').replace('100x100', '300x300') : '',
          previewUrl: track ? track.previewUrl : '',
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
