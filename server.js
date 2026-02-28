require('dotenv').config();
const express = require('express');
const cors = require('cors');
const SpotifyWebApi = require('spotify-web-api-node');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
});

let tokenExpiry = 0;

async function ensureToken() {
  if (Date.now() < tokenExpiry) return;
  const data = await spotifyApi.clientCredentialsGrant();
  spotifyApi.setAccessToken(data.body.access_token);
  tokenExpiry = Date.now() + (data.body.expires_in - 60) * 1000;
}

function extractError(err) {
  // spotify-web-api-node rejects with a plain object, not a standard Error
  if (err && typeof err === 'object') {
    if (err.message) return err.message;
    // { statusCode, error: { status, message } }
    if (err.error && err.error.message) return err.error.message;
    // { statusCode, error: 'string' }
    if (typeof err.error === 'string') return err.error;
    return JSON.stringify(err);
  }
  return String(err);
}

async function callWithRetry(fn) {
  try {
    return await fn();
  } catch (err) {
    // If token expired (401), force refresh once and retry
    if (err && err.statusCode === 401) {
      tokenExpiry = 0;
      await ensureToken();
      return await fn();
    }
    throw err;
  }
}

// Search tracks
app.get('/api/search/tracks', async (req, res) => {
  try {
    await ensureToken();
    const { q, limit = 20, offset = 0 } = req.query;
    if (!q) return res.status(400).json({ error: 'Query parameter "q" is required' });
    const data = await callWithRetry(() =>
      spotifyApi.searchTracks(q, { limit: parseInt(limit), offset: parseInt(offset) })
    );
    res.json(data.body);
  } catch (err) {
    res.status(500).json({ error: extractError(err) });
  }
});

// Search albums
app.get('/api/search/albums', async (req, res) => {
  try {
    await ensureToken();
    const { q, limit = 20, offset = 0 } = req.query;
    if (!q) return res.status(400).json({ error: 'Query parameter "q" is required' });
    const data = await callWithRetry(() =>
      spotifyApi.searchAlbums(q, { limit: parseInt(limit), offset: parseInt(offset) })
    );
    res.json(data.body);
  } catch (err) {
    res.status(500).json({ error: extractError(err) });
  }
});

// Search playlists
app.get('/api/search/playlists', async (req, res) => {
  try {
    await ensureToken();
    const { q, limit = 20, offset = 0 } = req.query;
    if (!q) return res.status(400).json({ error: 'Query parameter "q" is required' });
    const data = await callWithRetry(() =>
      spotifyApi.searchPlaylists(q, { limit: parseInt(limit), offset: parseInt(offset) })
    );
    res.json(data.body);
  } catch (err) {
    res.status(500).json({ error: extractError(err) });
  }
});

// Search artists
app.get('/api/search/artists', async (req, res) => {
  try {
    await ensureToken();
    const { q, limit = 20, offset = 0 } = req.query;
    if (!q) return res.status(400).json({ error: 'Query parameter "q" is required' });
    const data = await callWithRetry(() =>
      spotifyApi.searchArtists(q, { limit: parseInt(limit), offset: parseInt(offset) })
    );
    res.json(data.body);
  } catch (err) {
    res.status(500).json({ error: extractError(err) });
  }
});

// Get album tracks
app.get('/api/albums/:id/tracks', async (req, res) => {
  try {
    await ensureToken();
    const data = await callWithRetry(() =>
      spotifyApi.getAlbumTracks(req.params.id, { limit: 50 })
    );
    res.json(data.body);
  } catch (err) {
    res.status(500).json({ error: extractError(err) });
  }
});

// Get playlist tracks
app.get('/api/playlists/:id/tracks', async (req, res) => {
  try {
    await ensureToken();
    const data = await callWithRetry(() =>
      spotifyApi.getPlaylistTracks(req.params.id, { limit: 50 })
    );
    res.json(data.body);
  } catch (err) {
    res.status(500).json({ error: extractError(err) });
  }
});

// Get artist top tracks
app.get('/api/artists/:id/top-tracks', async (req, res) => {
  try {
    await ensureToken();
    const data = await callWithRetry(() =>
      spotifyApi.getArtistTopTracks(req.params.id, 'US')
    );
    res.json(data.body);
  } catch (err) {
    res.status(500).json({ error: extractError(err) });
  }
});

// Game API: fetch filtered songs for guessing game
app.get('/api/game/songs', async (req, res) => {
  try {
    await ensureToken();
    const { lang = 'any', era = 'any', popularity = 'any', artist = '', count = 50 } = req.query;

    // Language keyword mapping
    const langKeywords = {
      mandarin: ['华语', '国语', '普通话 流行', 'mandarin pop', '华语流行', '中文歌曲'],
      cantonese: ['粤语', 'Cantopop', '粤语流行', 'cantonese'],
      minnan: ['闽南语', '台语', 'minnan', '台湾闽南'],
      any: ['华语', '国语', '粤语', '中文歌', '华语流行'],
    };

    // Era mapping
    const eraMap = {
      '1960-1979': 'year:1960-1979',
      '1980-1989': 'year:1980-1989',
      '1990-1999': 'year:1990-1999',
      '2000-2009': 'year:2000-2009',
      '2010-2019': 'year:2010-2019',
      '2020-2025': 'year:2020-2025',
      any: '',
    };

    const keywords = langKeywords[lang] || langKeywords.any;
    const eraFilter = eraMap[era] || '';
    const artistFilter = artist ? ` artist:${artist}` : '';

    // Build search queries - combine language keywords with era
    const queries = keywords.slice(0, 3).map(kw => {
      let q = kw;
      if (eraFilter) q += ` ${eraFilter}`;
      if (artistFilter) q += artistFilter;
      return q;
    });

    // Also add pure artist search if artist specified
    if (artist) {
      let q = `artist:${artist}`;
      if (eraFilter) q += ` ${eraFilter}`;
      queries.push(q);
    }

    // Fetch from multiple offsets for variety
    const offsets = [0, 20, 40, 60, 80, 100];
    const requests = [];
    for (const q of queries) {
      for (const offset of offsets.slice(0, 3)) {
        requests.push(
          callWithRetry(() =>
            spotifyApi.searchTracks(q, { limit: 50, offset, market: 'TW' })
          ).catch(() => null)
        );
      }
    }

    const results = await Promise.all(requests);
    const trackMap = new Map();

    for (const result of results) {
      if (!result) continue;
      const items = result.body?.tracks?.items || [];
      for (const track of items) {
        if (!track || !track.preview_url) continue;
        if (trackMap.has(track.id)) continue;

        // Popularity filter
        if (popularity === 'high' && track.popularity < 70) continue;
        if (popularity === 'low' && track.popularity >= 40) continue;

        // Filter: song name must contain at least one Chinese character
        const hasChinese = /[\u4e00-\u9fff\u3400-\u4dbf]/.test(track.name);
        if (!hasChinese) continue;

        const year = track.album?.release_date
          ? parseInt(track.album.release_date.slice(0, 4))
          : null;

        trackMap.set(track.id, {
          id: track.id,
          name: track.name,
          artists: track.artists.map(a => a.name),
          album: track.album?.name || '',
          coverUrl: track.album?.images?.[0]?.url || '',
          previewUrl: track.preview_url,
          popularity: track.popularity,
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
    res.status(500).json({ error: extractError(err) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Spotify Demo server running at http://localhost:${PORT}`);
});
