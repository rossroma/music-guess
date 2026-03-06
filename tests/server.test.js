'use strict';

/**
 * Unit tests for server.js core logic.
 *
 * Since server.js wires Express at module load time, we replicate the pure
 * logic functions here and test them in isolation to avoid starting the HTTP
 * server or touching the real iTunes API.
 */

// ─── Replicated pure logic from server.js ────────────────────────────────────

const ERA_RANGE = {
  'pre-1990':  [0,    1989],
  '1990-1999': [1990, 1999],
  '2000-2009': [2000, 2009],
  '2010-2019': [2010, 2019],
  '2020-2026': [2020, 2026],
};

/**
 * Filter songs from the local database according to query parameters.
 * Mirrors the filter block inside GET /api/game/songs.
 */
function filterSongs(songsDb, { lang = 'any', era = 'any', artist = '' } = {}) {
  const eraRange = ERA_RANGE[era] || null;
  return songsDb.filter(s => {
    if (lang !== 'any' && s.lang !== lang) return false;
    if (eraRange && (s.year < eraRange[0] || s.year > eraRange[1])) return false;
    if (artist && !s.artist.includes(artist)) return false;
    return true;
  });
}

/**
 * Fisher-Yates shuffle (same algorithm as server.js).
 */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Build the iTunes search URL for a song (mirrors itunesLookup URL construction).
 */
function buildItunesUrl(title, artist) {
  const base = 'https://itunes.apple.com';
  return base + '/search?' + new URLSearchParams({
    term:    `${title} ${artist}`,
    entity:  'song',
    media:   'music',
    limit:   '5',
    country: 'TW',
    lang:    'zh_tw',
  });
}

/**
 * Pick the best iTunes result: has previewUrl AND trackName includes title.
 * Mirrors the logic inside itunesLookup.
 */
function pickBestItunesMatch(results, title) {
  return (results || []).find(t => t.previewUrl && t.trackName.includes(title)) || null;
}

/**
 * Build the enriched song object that the API returns.
 * Mirrors the push({...}) block in the /api/game/songs handler.
 */
function buildEnrichedSong(s, track) {
  return {
    id:         String(s.id),
    name:       s.title,
    artists:    [s.artist],
    album:      track ? (track.collectionName || '') : '',
    coverUrl:   track ? (track.artworkUrl100 || '').replace('100x100', '300x300') : '',
    previewUrl: track ? track.previewUrl : '',
    year:       s.year,
    lang:       s.lang,
    initial:    s.initial,
    pinyin:     s.pinyin,
  };
}

// ─── Sample fixtures ──────────────────────────────────────────────────────────

const SAMPLE_SONGS = [
  { id: 1,  title: '青花瓷', artist: '周杰伦', year: 2007, lang: 'zh', initial: 'QHC',  pinyin: 'qinghuaci' },
  { id: 2,  title: '七里香', artist: '周杰伦', year: 2004, lang: 'zh', initial: 'QLX',  pinyin: 'qilixiang' },
  { id: 3,  title: '劲歌金曲', artist: '谭咏麟', year: 1988, lang: 'yue', initial: 'JGJQ', pinyin: 'jingge jinqu' },
  { id: 4,  title: '海阔天空', artist: 'Beyond', year: 1993, lang: 'yue', initial: 'HKTK', pinyin: 'haikuo tiankong' },
  { id: 5,  title: '泡沫',   artist: '邓紫棋', year: 2012, lang: 'zh',  initial: 'PM',   pinyin: 'paomo' },
  { id: 6,  title: '光年之外', artist: '邓紫棋', year: 2016, lang: 'zh',  initial: 'GNZW', pinyin: 'guangnian zhiwai' },
  { id: 7,  title: '飞鸟',   artist: '王菲',   year: 1997, lang: 'zh',  initial: 'FN',   pinyin: 'feiniao' },
  { id: 8,  title: '天空',   artist: '梁静茹', year: 2021, lang: 'zh',  initial: 'TK',   pinyin: 'tiankong' },
];

// ─── Tests: ERA_RANGE ─────────────────────────────────────────────────────────

describe('ERA_RANGE constant', () => {
  test('contains exactly 5 era keys', () => {
    expect(Object.keys(ERA_RANGE)).toHaveLength(5);
  });

  test('pre-1990 range is [0, 1989]', () => {
    expect(ERA_RANGE['pre-1990']).toEqual([0, 1989]);
  });

  test('1990-1999 range is [1990, 1999]', () => {
    expect(ERA_RANGE['1990-1999']).toEqual([1990, 1999]);
  });

  test('2000-2009 range is [2000, 2009]', () => {
    expect(ERA_RANGE['2000-2009']).toEqual([2000, 2009]);
  });

  test('2010-2019 range is [2010, 2019]', () => {
    expect(ERA_RANGE['2010-2019']).toEqual([2010, 2019]);
  });

  test('2020-2026 range is [2020, 2026]', () => {
    expect(ERA_RANGE['2020-2026']).toEqual([2020, 2026]);
  });

  test('unknown era key returns undefined (→ no range filter)', () => {
    expect(ERA_RANGE['unknown']).toBeUndefined();
  });
});

// ─── Tests: filterSongs ───────────────────────────────────────────────────────

describe('filterSongs', () => {
  test('no filters returns all songs', () => {
    const result = filterSongs(SAMPLE_SONGS);
    expect(result).toHaveLength(SAMPLE_SONGS.length);
  });

  test('lang=any returns all songs', () => {
    const result = filterSongs(SAMPLE_SONGS, { lang: 'any' });
    expect(result).toHaveLength(SAMPLE_SONGS.length);
  });

  test('lang=zh returns only Mandarin songs', () => {
    const result = filterSongs(SAMPLE_SONGS, { lang: 'zh' });
    expect(result.every(s => s.lang === 'zh')).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  test('lang=yue returns only Cantonese songs', () => {
    const result = filterSongs(SAMPLE_SONGS, { lang: 'yue' });
    expect(result.every(s => s.lang === 'yue')).toBe(true);
    expect(result).toHaveLength(2);
  });

  test('era=pre-1990 returns only songs with year <= 1989', () => {
    const result = filterSongs(SAMPLE_SONGS, { era: 'pre-1990' });
    expect(result.every(s => s.year <= 1989)).toBe(true);
    expect(result).toHaveLength(1); // id:3 year:1988
  });

  test('era=1990-1999 returns songs within range', () => {
    const result = filterSongs(SAMPLE_SONGS, { era: '1990-1999' });
    expect(result.every(s => s.year >= 1990 && s.year <= 1999)).toBe(true);
    // id:4 (1993), id:7 (1997)
    expect(result).toHaveLength(2);
  });

  test('era=2000-2009 returns songs within range', () => {
    const result = filterSongs(SAMPLE_SONGS, { era: '2000-2009' });
    expect(result.every(s => s.year >= 2000 && s.year <= 2009)).toBe(true);
    // id:1 (2007), id:2 (2004)
    expect(result).toHaveLength(2);
  });

  test('era=2010-2019 returns songs within range', () => {
    const result = filterSongs(SAMPLE_SONGS, { era: '2010-2019' });
    expect(result.every(s => s.year >= 2010 && s.year <= 2019)).toBe(true);
    // id:5 (2012), id:6 (2016)
    expect(result).toHaveLength(2);
  });

  test('era=2020-2026 returns songs within range', () => {
    const result = filterSongs(SAMPLE_SONGS, { era: '2020-2026' });
    expect(result.every(s => s.year >= 2020 && s.year <= 2026)).toBe(true);
    // id:8 (2021)
    expect(result).toHaveLength(1);
  });

  test('era=any returns all songs regardless of year', () => {
    const result = filterSongs(SAMPLE_SONGS, { era: 'any' });
    expect(result).toHaveLength(SAMPLE_SONGS.length);
  });

  test('artist filter matches by substring', () => {
    const result = filterSongs(SAMPLE_SONGS, { artist: '周杰伦' });
    expect(result.every(s => s.artist.includes('周杰伦'))).toBe(true);
    expect(result).toHaveLength(2);
  });

  test('artist filter with empty string returns all songs', () => {
    const result = filterSongs(SAMPLE_SONGS, { artist: '' });
    expect(result).toHaveLength(SAMPLE_SONGS.length);
  });

  test('combined lang + era filter', () => {
    // zh songs from 2010-2019: id:5 (2012), id:6 (2016)
    const result = filterSongs(SAMPLE_SONGS, { lang: 'zh', era: '2010-2019' });
    expect(result.every(s => s.lang === 'zh' && s.year >= 2010 && s.year <= 2019)).toBe(true);
    expect(result).toHaveLength(2);
  });

  test('combined lang + artist filter', () => {
    const result = filterSongs(SAMPLE_SONGS, { lang: 'zh', artist: '邓紫棋' });
    expect(result.every(s => s.lang === 'zh' && s.artist.includes('邓紫棋'))).toBe(true);
    expect(result).toHaveLength(2);
  });

  test('filter that matches nothing returns empty array', () => {
    const result = filterSongs(SAMPLE_SONGS, { lang: 'zh', era: 'pre-1990' });
    expect(result).toHaveLength(0);
  });

  test('unknown lang value returns no songs', () => {
    const result = filterSongs(SAMPLE_SONGS, { lang: 'ja' });
    expect(result).toHaveLength(0);
  });

  test('does not mutate the original array', () => {
    const original = [...SAMPLE_SONGS];
    filterSongs(SAMPLE_SONGS, { lang: 'zh', era: '2000-2009' });
    expect(SAMPLE_SONGS).toEqual(original);
  });
});

// ─── Tests: shuffle ───────────────────────────────────────────────────────────

describe('shuffle', () => {
  test('returns array of same length', () => {
    const arr = [1, 2, 3, 4, 5];
    expect(shuffle(arr)).toHaveLength(arr.length);
  });

  test('contains the same elements', () => {
    const arr = [1, 2, 3, 4, 5];
    expect(shuffle(arr).sort()).toEqual([...arr].sort());
  });

  test('does not mutate the original array', () => {
    const arr = [1, 2, 3, 4, 5];
    const copy = [...arr];
    shuffle(arr);
    expect(arr).toEqual(copy);
  });

  test('handles empty array', () => {
    expect(shuffle([])).toEqual([]);
  });

  test('handles single-element array', () => {
    expect(shuffle([42])).toEqual([42]);
  });

  test('returns a new array reference', () => {
    const arr = [1, 2, 3];
    expect(shuffle(arr)).not.toBe(arr);
  });
});

// ─── Tests: buildItunesUrl ────────────────────────────────────────────────────

describe('buildItunesUrl', () => {
  test('URL contains the iTunes base', () => {
    const url = buildItunesUrl('青花瓷', '周杰伦');
    expect(url).toContain('https://itunes.apple.com/search');
  });

  test('URL encodes the term parameter as "title+artist" (URLSearchParams form-encoding)', () => {
    const url = buildItunesUrl('青花瓷', '周杰伦');
    // URLSearchParams encodes spaces as '+', not %20
    const encoded = new URLSearchParams({ term: '青花瓷 周杰伦' }).toString();
    expect(url).toContain(encoded);
  });

  test('URL contains entity=song', () => {
    const url = buildItunesUrl('青花瓷', '周杰伦');
    expect(url).toContain('entity=song');
  });

  test('URL contains country=TW', () => {
    const url = buildItunesUrl('青花瓷', '周杰伦');
    expect(url).toContain('country=TW');
  });

  test('URL contains limit=5', () => {
    const url = buildItunesUrl('青花瓷', '周杰伦');
    expect(url).toContain('limit=5');
  });

  test('URL contains lang=zh_tw', () => {
    const url = buildItunesUrl('青花瓷', '周杰伦');
    expect(url).toContain('lang=zh_tw');
  });
});

// ─── Tests: pickBestItunesMatch ───────────────────────────────────────────────

describe('pickBestItunesMatch', () => {
  const title = '青花瓷';

  test('returns null for empty results array', () => {
    expect(pickBestItunesMatch([], title)).toBeNull();
  });

  test('returns null when results is null/undefined', () => {
    expect(pickBestItunesMatch(null, title)).toBeNull();
    expect(pickBestItunesMatch(undefined, title)).toBeNull();
  });

  test('returns null when no result has previewUrl', () => {
    const results = [{ trackName: '青花瓷', previewUrl: null }];
    expect(pickBestItunesMatch(results, title)).toBeNull();
  });

  test('returns null when no trackName includes the title', () => {
    const results = [{ trackName: '七里香', previewUrl: 'http://example.com/preview.m4a' }];
    expect(pickBestItunesMatch(results, title)).toBeNull();
  });

  test('returns match when previewUrl exists and trackName includes title', () => {
    const match = { trackName: '青花瓷', previewUrl: 'http://example.com/qinghuaci.m4a' };
    const results = [match];
    expect(pickBestItunesMatch(results, title)).toBe(match);
  });

  test('returns first valid match from multiple results', () => {
    const first  = { trackName: '青花瓷 (Live)', previewUrl: 'http://example.com/a.m4a' };
    const second = { trackName: '青花瓷',        previewUrl: 'http://example.com/b.m4a' };
    expect(pickBestItunesMatch([first, second], title)).toBe(first);
  });

  test('skips results without previewUrl and returns next valid match', () => {
    const invalid = { trackName: '青花瓷', previewUrl: '' };
    const valid   = { trackName: '青花瓷 MV', previewUrl: 'http://example.com/c.m4a' };
    expect(pickBestItunesMatch([invalid, valid], title)).toBe(valid);
  });
});

// ─── Tests: buildEnrichedSong ─────────────────────────────────────────────────

describe('buildEnrichedSong', () => {
  const song = SAMPLE_SONGS[0]; // 青花瓷 / 周杰伦 / 2007

  test('id is stringified', () => {
    expect(buildEnrichedSong(song, null).id).toBe('1');
  });

  test('name maps to title', () => {
    expect(buildEnrichedSong(song, null).name).toBe('青花瓷');
  });

  test('artists is array wrapping artist string', () => {
    expect(buildEnrichedSong(song, null).artists).toEqual(['周杰伦']);
  });

  test('year is preserved', () => {
    expect(buildEnrichedSong(song, null).year).toBe(2007);
  });

  test('lang is preserved', () => {
    expect(buildEnrichedSong(song, null).lang).toBe('zh');
  });

  test('initial is preserved', () => {
    expect(buildEnrichedSong(song, null).initial).toBe('QHC');
  });

  test('pinyin is preserved', () => {
    expect(buildEnrichedSong(song, null).pinyin).toBe('qinghuaci');
  });

  test('when track is null, coverUrl and previewUrl are empty strings', () => {
    const result = buildEnrichedSong(song, null);
    expect(result.coverUrl).toBe('');
    expect(result.previewUrl).toBe('');
    expect(result.album).toBe('');
  });

  test('when track is provided, previewUrl is taken from track', () => {
    const track = {
      collectionName: 'Jay Chou Album',
      artworkUrl100:  'https://example.com/100x100bb.jpg',
      previewUrl:     'https://audio-ssl.example.com/preview.m4a',
    };
    const result = buildEnrichedSong(song, track);
    expect(result.previewUrl).toBe('https://audio-ssl.example.com/preview.m4a');
  });

  test('when track is provided, coverUrl replaces 100x100 with 300x300', () => {
    const track = {
      collectionName: 'Jay Chou Album',
      artworkUrl100:  'https://example.com/100x100bb.jpg',
      previewUrl:     'https://audio-ssl.example.com/preview.m4a',
    };
    const result = buildEnrichedSong(song, track);
    expect(result.coverUrl).toBe('https://example.com/300x300bb.jpg');
    expect(result.coverUrl).not.toContain('100x100');
  });

  test('when track is provided, album maps to collectionName', () => {
    const track = {
      collectionName: 'Jay Chou Album',
      artworkUrl100:  'https://example.com/100x100bb.jpg',
      previewUrl:     'https://audio-ssl.example.com/preview.m4a',
    };
    expect(buildEnrichedSong(song, track).album).toBe('Jay Chou Album');
  });

  test('when track.artworkUrl100 is undefined, coverUrl is empty string', () => {
    const track = { collectionName: 'Album', artworkUrl100: undefined, previewUrl: 'url' };
    expect(buildEnrichedSong(song, track).coverUrl).toBe('');
  });

  test('when track.collectionName is undefined, album is empty string', () => {
    const track = { collectionName: undefined, artworkUrl100: 'url', previewUrl: 'url' };
    expect(buildEnrichedSong(song, track).album).toBe('');
  });
});
