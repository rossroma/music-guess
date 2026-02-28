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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Spotify Demo server running at http://localhost:${PORT}`);
});
