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

// Search tracks
app.get('/api/search/tracks', async (req, res) => {
  try {
    await ensureToken();
    const { q, limit = 20, offset = 0 } = req.query;
    if (!q) return res.status(400).json({ error: 'Query parameter "q" is required' });
    const data = await spotifyApi.searchTracks(q, { limit: parseInt(limit), offset: parseInt(offset) });
    res.json(data.body);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Search albums
app.get('/api/search/albums', async (req, res) => {
  try {
    await ensureToken();
    const { q, limit = 20, offset = 0 } = req.query;
    if (!q) return res.status(400).json({ error: 'Query parameter "q" is required' });
    const data = await spotifyApi.searchAlbums(q, { limit: parseInt(limit), offset: parseInt(offset) });
    res.json(data.body);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Search playlists
app.get('/api/search/playlists', async (req, res) => {
  try {
    await ensureToken();
    const { q, limit = 20, offset = 0 } = req.query;
    if (!q) return res.status(400).json({ error: 'Query parameter "q" is required' });
    const data = await spotifyApi.searchPlaylists(q, { limit: parseInt(limit), offset: parseInt(offset) });
    res.json(data.body);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Search artists
app.get('/api/search/artists', async (req, res) => {
  try {
    await ensureToken();
    const { q, limit = 20, offset = 0 } = req.query;
    if (!q) return res.status(400).json({ error: 'Query parameter "q" is required' });
    const data = await spotifyApi.searchArtists(q, { limit: parseInt(limit), offset: parseInt(offset) });
    res.json(data.body);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get album tracks
app.get('/api/albums/:id/tracks', async (req, res) => {
  try {
    await ensureToken();
    const data = await spotifyApi.getAlbumTracks(req.params.id, { limit: 50 });
    res.json(data.body);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get playlist tracks
app.get('/api/playlists/:id/tracks', async (req, res) => {
  try {
    await ensureToken();
    const data = await spotifyApi.getPlaylistTracks(req.params.id, { limit: 50 });
    res.json(data.body);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get artist top tracks
app.get('/api/artists/:id/top-tracks', async (req, res) => {
  try {
    await ensureToken();
    const data = await spotifyApi.getArtistTopTracks(req.params.id, 'US');
    res.json(data.body);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Spotify Demo server running at http://localhost:${PORT}`);
});
