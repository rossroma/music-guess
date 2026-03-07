#!/usr/bin/env node
/**
 * 汇总 data 目录下所有 JSON 榜单为一份去重后的歌曲列表
 * 数据格式：根数组 [{ rank, singer, song, year, lang }] 或对象 { "key": [ ... ] }
 * 输出格式：id, title, artist, year, lang, initial, pinyin
 */

const fs = require('fs');
const path = require('path');
const pinyinLib = require('pinyin');
const pinyin = pinyinLib.default || pinyinLib;

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUT_FILE = path.join(__dirname, '..', 'songs-summary.json');

/**
 * 从文件中解析出歌曲数组（兼容根数组 或 对象内单数组）
 */
function getSongsArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const key = Object.keys(data).find(k => Array.isArray(data[k]));
    return key ? data[key] : null;
  }
  return null;
}

function hasChinese(str) {
  return /[\u4e00-\u9fff]/.test(str);
}

function toInitial(str) {
  const s = (str || '').trim();
  if (!s) return '';
  if (!hasChinese(s)) {
    return s.split(/\s+/).map(w => (w[0] || '').toUpperCase()).join('');
  }
  const arr = pinyin(s, { style: 'first_letter' });
  return (arr || []).map(c => (c && c[0] ? c[0] : '')).join('').toUpperCase();
}

function toPinyin(str) {
  const s = (str || '').trim();
  if (!s) return '';
  if (!hasChinese(s)) {
    return s.replace(/\s+/g, '').toLowerCase();
  }
  const arr = pinyin(s, { style: 'normal' });
  return (arr || []).map(c => (c && c[0] ? c[0] : '')).join('').toLowerCase();
}

function main() {
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
  const map = new Map(); // key: title|artist -> { title, artist, year, lang, initial, pinyin }

  for (const file of files) {
    const filePath = path.join(DATA_DIR, file);
    let raw;
    try {
      raw = fs.readFileSync(filePath, 'utf8');
    } catch (e) {
      console.warn('跳过无法读取的文件:', file, e.message);
      continue;
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      console.warn('跳过无效 JSON:', file, e.message);
      continue;
    }

    const songs = getSongsArray(data);
    if (!Array.isArray(songs) || songs.length === 0) {
      console.warn('无有效歌曲数组:', file);
      continue;
    }

    for (const item of songs) {
      const title = (item.song || item.title || '').trim();
      const artist = (item.singer || item.artist || '').trim();
      if (!title || !artist) continue;

      const year = typeof item.year === 'number' && item.year > 0 ? item.year : null;
      const lang = (item.lang && typeof item.lang === 'string') ? item.lang : 'zh';
      const key = `${title}|${artist}`;

      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          title,
          artist,
          year: year != null ? year : 0,
          lang,
          initial: toInitial(title),
          pinyin: toPinyin(title),
        });
      } else {
        if (year != null && (existing.year === 0 || year < existing.year)) {
          existing.year = year;
        }
      }
    }
  }

  const list = Array.from(map.values())
    .filter(r => r.year > 0)
    .sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return (a.title + a.artist).localeCompare(b.title + b.artist);
    })
    .map((r, i) => ({
      id: i + 1,
      title: r.title,
      artist: r.artist,
      year: r.year,
      lang: r.lang,
      initial: r.initial,
      pinyin: r.pinyin,
    }));

  fs.writeFileSync(OUT_FILE, JSON.stringify(list, null, 2), 'utf8');
  console.log('已写入 %s，共 %d 首（去重后）', OUT_FILE, list.length);
}

main();
