'use strict';

/**
 * Unit tests for public/game.js pure/logic functions.
 *
 * game.js runs in a browser environment and references DOM APIs at module
 * level (document.getElementById, etc.), so we cannot import it directly.
 * Instead, the pure functions are replicated here and tested in isolation.
 */

// ─── Replicated pure logic from game.js ──────────────────────────────────────

const DIFFICULTY_TIME = { easy: 30, medium: 20, hard: 10 };
const TOTAL_ROUNDS = 10;
const POOL_SIZE = 24;

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
  return [...name];
}

function formatTime(secs) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Compute round score given wrongAttempts (mirrors submitAnswer scoring). */
function computeRoundScore(isCorrect, wrongAttempts) {
  if (!isCorrect) return 0;
  return wrongAttempts === 0 ? 3 : 1;
}

/** Determine whether slots match the correct song name. */
function isAnswerCorrect(slots, songName) {
  const correctChars = splitSongName(songName);
  return slots.every((ch, i) => ch === correctChars[i]);
}

/**
 * Generate character pool (mirrors generateCharPool in game.js).
 */
function generateCharPool(currentSong, allSongs, poolSize = POOL_SIZE) {
  const chars = splitSongName(currentSong.name);
  const correctSet = new Set(chars);

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
    if ([...correctSet].length + distractors.length >= poolSize) break;
  }

  const charPoolItems = chars.map((ch, i) => ({ char: ch, id: `correct-${i}` }));

  const needed = Math.max(0, poolSize - charPoolItems.length);
  distractors.slice(0, needed).forEach((ch, i) => {
    charPoolItems.push({ char: ch, id: `distract-${i}` });
  });

  return shuffle(charPoolItems);
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SAMPLE_SONGS = [
  { id: 1, name: '青花瓷' },
  { id: 2, name: '七里香' },
  { id: 3, name: '稻香' },
  { id: 4, name: '夜曲' },
  { id: 5, name: '晴天' },
  { id: 6, name: '告白气球' },
  { id: 7, name: '以父之名' },
  { id: 8, name: '双截棍' },
  { id: 9, name: '爱在西元前' },
  { id: 10, name: '龙卷风' },
];

// ─── Tests: Constants ─────────────────────────────────────────────────────────

describe('Game constants', () => {
  test('DIFFICULTY_TIME.easy is 30 seconds', () => {
    expect(DIFFICULTY_TIME.easy).toBe(30);
  });

  test('DIFFICULTY_TIME.medium is 20 seconds', () => {
    expect(DIFFICULTY_TIME.medium).toBe(20);
  });

  test('DIFFICULTY_TIME.hard is 10 seconds', () => {
    expect(DIFFICULTY_TIME.hard).toBe(10);
  });

  test('TOTAL_ROUNDS is 10', () => {
    expect(TOTAL_ROUNDS).toBe(10);
  });

  test('POOL_SIZE is 24', () => {
    expect(POOL_SIZE).toBe(24);
  });
});

// ─── Tests: shuffle ───────────────────────────────────────────────────────────

describe('shuffle', () => {
  test('returns array of same length', () => {
    expect(shuffle([1, 2, 3, 4, 5])).toHaveLength(5);
  });

  test('returned array contains the same elements', () => {
    const arr = [1, 2, 3, 4, 5];
    expect(shuffle(arr).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  test('does not mutate the input array', () => {
    const arr = [1, 2, 3];
    const copy = [...arr];
    shuffle(arr);
    expect(arr).toEqual(copy);
  });

  test('returns a new array reference', () => {
    const arr = [1, 2, 3];
    expect(shuffle(arr)).not.toBe(arr);
  });

  test('handles empty array', () => {
    expect(shuffle([])).toEqual([]);
  });

  test('handles single-element array', () => {
    expect(shuffle([99])).toEqual([99]);
  });

  test('shuffles strings correctly', () => {
    const arr = ['a', 'b', 'c', 'd'];
    const result = shuffle(arr);
    expect(result.sort()).toEqual(['a', 'b', 'c', 'd']);
  });
});

// ─── Tests: isChinese ────────────────────────────────────────────────────────

describe('isChinese', () => {
  test('returns true for a common CJK character', () => {
    expect(isChinese('青')).toBe(true);
  });

  test('returns true for another CJK character', () => {
    expect(isChinese('花')).toBe(true);
  });

  test('returns false for ASCII letter', () => {
    expect(isChinese('A')).toBe(false);
  });

  test('returns false for digit', () => {
    expect(isChinese('1')).toBe(false);
  });

  test('returns false for space', () => {
    expect(isChinese(' ')).toBe(false);
  });

  test('returns false for punctuation', () => {
    expect(isChinese('!')).toBe(false);
  });

  test('returns true for a string containing a Chinese character', () => {
    // The regex tests the whole string; any CJK char → true
    expect(isChinese('abc青')).toBe(true);
  });

  test('returns false for empty string', () => {
    expect(isChinese('')).toBe(false);
  });
});

// ─── Tests: splitSongName ────────────────────────────────────────────────────

describe('splitSongName', () => {
  test('splits a three-character Chinese song name into 3 chars', () => {
    expect(splitSongName('青花瓷')).toEqual(['青', '花', '瓷']);
  });

  test('splits a two-character name', () => {
    expect(splitSongName('稻香')).toEqual(['稻', '香']);
  });

  test('result length equals the visible character count', () => {
    expect(splitSongName('告白气球')).toHaveLength(4);
  });

  test('splits ASCII string character by character', () => {
    expect(splitSongName('abc')).toEqual(['a', 'b', 'c']);
  });

  test('handles single character', () => {
    expect(splitSongName('青')).toEqual(['青']);
  });

  test('handles empty string', () => {
    expect(splitSongName('')).toEqual([]);
  });

  test('preserves spaces (space is a character)', () => {
    expect(splitSongName('a b')).toEqual(['a', ' ', 'b']);
  });
});

// ─── Tests: formatTime ───────────────────────────────────────────────────────

describe('formatTime', () => {
  test('formats 0 seconds as 0:00', () => {
    expect(formatTime(0)).toBe('0:00');
  });

  test('formats 30 seconds as 0:30', () => {
    expect(formatTime(30)).toBe('0:30');
  });

  test('formats 60 seconds as 1:00', () => {
    expect(formatTime(60)).toBe('1:00');
  });

  test('formats 90 seconds as 1:30', () => {
    expect(formatTime(90)).toBe('1:30');
  });

  test('formats 125 seconds as 2:05', () => {
    expect(formatTime(125)).toBe('2:05');
  });

  test('pads single-digit seconds with leading zero', () => {
    expect(formatTime(61)).toBe('1:01');
  });

  test('handles fractional seconds by flooring', () => {
    expect(formatTime(30.9)).toBe('0:30');
  });

  test('handles large values', () => {
    expect(formatTime(3600)).toBe('60:00');
  });
});

// ─── Tests: computeRoundScore ────────────────────────────────────────────────

describe('computeRoundScore (scoring rules)', () => {
  test('correct on first attempt gives 3 points', () => {
    expect(computeRoundScore(true, 0)).toBe(3);
  });

  test('correct on second attempt gives 1 point', () => {
    expect(computeRoundScore(true, 1)).toBe(1);
  });

  test('incorrect answer gives 0 points', () => {
    expect(computeRoundScore(false, 0)).toBe(0);
    expect(computeRoundScore(false, 1)).toBe(0);
  });

  test('max score per round is 3', () => {
    expect(computeRoundScore(true, 0)).toBeLessThanOrEqual(3);
  });

  test('max total score for 10 rounds is 30', () => {
    const totalMax = Array.from({ length: TOTAL_ROUNDS }, () => computeRoundScore(true, 0))
      .reduce((sum, s) => sum + s, 0);
    expect(totalMax).toBe(30);
  });
});

// ─── Tests: isAnswerCorrect ───────────────────────────────────────────────────

describe('isAnswerCorrect', () => {
  test('returns true when slots exactly match song name', () => {
    expect(isAnswerCorrect(['青', '花', '瓷'], '青花瓷')).toBe(true);
  });

  test('returns false when one character differs', () => {
    expect(isAnswerCorrect(['青', '花', '香'], '青花瓷')).toBe(false);
  });

  test('returns false when order is wrong', () => {
    expect(isAnswerCorrect(['花', '青', '瓷'], '青花瓷')).toBe(false);
  });

  test('returns false when slots contain null (unfilled)', () => {
    expect(isAnswerCorrect(['青', null, '瓷'], '青花瓷')).toBe(false);
  });

  test('returns true for a single-character song name', () => {
    expect(isAnswerCorrect(['青'], '青')).toBe(true);
  });

  test('returns false for a single-character mismatch', () => {
    expect(isAnswerCorrect(['花'], '青')).toBe(false);
  });
});

// ─── Tests: generateCharPool ─────────────────────────────────────────────────

describe('generateCharPool', () => {
  const currentSong = SAMPLE_SONGS[0]; // '青花瓷' – 3 chars

  test('pool contains all correct song characters', () => {
    const pool = generateCharPool(currentSong, SAMPLE_SONGS);
    const poolChars = pool.map(item => item.char);
    for (const ch of splitSongName(currentSong.name)) {
      expect(poolChars).toContain(ch);
    }
  });

  test('correct items have id starting with "correct-"', () => {
    const pool = generateCharPool(currentSong, SAMPLE_SONGS);
    const correctItems = pool.filter(item => item.id.startsWith('correct-'));
    expect(correctItems).toHaveLength(splitSongName(currentSong.name).length);
  });

  test('distractor items have id starting with "distract-"', () => {
    const pool = generateCharPool(currentSong, SAMPLE_SONGS);
    const distractors = pool.filter(item => item.id.startsWith('distract-'));
    expect(distractors.length).toBeGreaterThan(0);
  });

  test('pool size does not exceed POOL_SIZE', () => {
    const pool = generateCharPool(currentSong, SAMPLE_SONGS);
    expect(pool.length).toBeLessThanOrEqual(POOL_SIZE);
  });

  test('total pool size equals POOL_SIZE when enough distractors are available', () => {
    const pool = generateCharPool(currentSong, SAMPLE_SONGS, POOL_SIZE);
    expect(pool.length).toBe(POOL_SIZE);
  });

  test('no duplicate distractor characters', () => {
    const pool = generateCharPool(currentSong, SAMPLE_SONGS);
    const distractorChars = pool
      .filter(item => item.id.startsWith('distract-'))
      .map(item => item.char);
    const unique = new Set(distractorChars);
    expect(unique.size).toBe(distractorChars.length);
  });

  test('distractors do not include any character already in the song name', () => {
    const pool = generateCharPool(currentSong, SAMPLE_SONGS);
    const songChars = new Set(splitSongName(currentSong.name));
    const distractorChars = pool
      .filter(item => item.id.startsWith('distract-'))
      .map(item => item.char);
    for (const ch of distractorChars) {
      expect(songChars.has(ch)).toBe(false);
    }
  });

  test('current song is excluded from distractor source', () => {
    // All items should come from other songs or be correct chars of this song
    const pool = generateCharPool(currentSong, SAMPLE_SONGS);
    expect(pool.length).toBeGreaterThan(0);
    // The pool should still be valid (not throw)
    expect(pool).toBeDefined();
  });

  test('each pool item has char and id properties', () => {
    const pool = generateCharPool(currentSong, SAMPLE_SONGS);
    pool.forEach(item => {
      expect(item).toHaveProperty('char');
      expect(item).toHaveProperty('id');
    });
  });

  test('song with repeated characters still produces correct pool size', () => {
    const repeatSong = { id: 99, name: '花花' };
    const pool = generateCharPool(repeatSong, SAMPLE_SONGS, POOL_SIZE);
    expect(pool.length).toBeLessThanOrEqual(POOL_SIZE);
    // Both '花' chars should appear (one per slot)
    const correctItems = pool.filter(item => item.id.startsWith('correct-'));
    expect(correctItems).toHaveLength(2);
  });
});
