import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  LANGUAGES,
  DEFAULT_LANGUAGE,
  STRINGS,
  normalizeLanguage,
  otherLanguage,
  translate,
  pick,
} from '../src/i18n.js';
import { FRACTAL_TYPES } from '../src/fractals.js';
import { PALETTES } from '../src/palettes.js';
import { PLACES } from '../src/places.js';

const root = new URL('../', import.meta.url);
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

/** Every string literal in the page and the UI code that looks like a message key. */
function keysUsedByTheApp() {
  const prefixes = new Set(Object.keys(STRINGS.en).map((key) => key.split('.')[0]));
  const sources = [readFileSync(new URL('index.html', root), 'utf8')];
  for (const name of readdirSync(new URL('src/', root))) {
    if (name.endsWith('.js') && name !== 'i18n.js') sources.push(readFileSync(new URL(`src/${name}`, root), 'utf8'));
  }
  const used = new Set();
  for (const source of sources) {
    for (const [, key] of source.matchAll(/["']([a-z]+\.[a-zA-Z]+)["']/g)) {
      if (prefixes.has(key.split('.')[0])) used.add(key);
    }
  }
  return used;
}

test('English and Turkish have the same keys, none of them empty', () => {
  assert.deepEqual(LANGUAGES, ['en', 'tr']);
  assert.equal(DEFAULT_LANGUAGE, 'en');
  assert.deepEqual(Object.keys(STRINGS.tr).sort(), Object.keys(STRINGS.en).sort());
  for (const lang of LANGUAGES) {
    for (const [key, text] of Object.entries(STRINGS[lang])) {
      assert.equal(typeof text, 'string', `${lang} ${key}`);
      assert.ok(text.trim().length > 0, `${lang} ${key} is empty`);
    }
  }
});

test('both languages use the same placeholders and really differ', () => {
  let same = 0;
  for (const key of Object.keys(STRINGS.en)) {
    assert.deepEqual(placeholders(STRINGS.tr[key]), placeholders(STRINGS.en[key]), key);
    if (STRINGS.tr[key] === STRINGS.en[key]) same++;
  }
  assert.ok(same <= 2, `${same} strings are not translated`);
  assert.equal(translate('en', 'lang.code'), 'TR', 'the toggle shows the language it switches to');
  assert.equal(translate('tr', 'lang.code'), 'EN');
});

test('every key the page and the UI code use exists, and every string is used', () => {
  const used = keysUsedByTheApp();
  for (const key of used) assert.ok(key in STRINGS.en, `missing message ${key}`);
  for (const key of Object.keys(STRINGS.en)) assert.ok(used.has(key), `unused message ${key}`);
});

test('translate fills placeholders and falls back to English, then to the key', () => {
  assert.equal(translate('en', 'info.rendering', { percent: 42 }), 'drawing 42%');
  assert.equal(translate('tr', 'info.rendering', { percent: 42 }), 'çiziliyor %42');
  assert.equal(translate('en', 'info.rendering'), 'drawing {percent}%', 'unknown placeholders stay');
  assert.equal(translate('de', 'header.reset'), 'Reset');
  assert.equal(translate('tr', 'no.such.key'), 'no.such.key');
});

test('languages are validated and the toggle flips between them', () => {
  assert.equal(normalizeLanguage('tr'), 'tr');
  assert.equal(normalizeLanguage('TR'), 'en');
  assert.equal(normalizeLanguage(null), 'en');
  assert.equal(otherLanguage('en'), 'tr');
  assert.equal(otherLanguage('tr'), 'en');
  assert.equal(otherLanguage('xx'), 'tr');
});

test('names that come with the data exist in both languages', () => {
  const pairs = [
    ...FRACTAL_TYPES.map((type) => type.label),
    ...PALETTES.map((palette) => palette.name),
    ...PLACES.flatMap((place) => [place.name, place.description]),
  ];
  for (const pair of pairs) {
    for (const lang of LANGUAGES) assert.ok(pick(lang, pair).length > 0);
  }
  assert.equal(pick('tr', { en: 'Coral Reef', tr: 'Mercan Resifi' }), 'Mercan Resifi');
  assert.equal(pick('xx', { en: 'Coral Reef', tr: 'Mercan Resifi' }), 'Coral Reef');
});
