import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readStored, writeStored } from '../src/storage.js';

/** A Map-backed stand-in for localStorage. */
function memoryStorage() {
  const map = new Map();
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
  };
}

test('values round-trip as JSON under the app prefix', () => {
  const storage = memoryStorage();
  assert.equal(writeStored('prefs', { paletteId: 'neon', density: 1.5 }, storage), true);
  assert.deepEqual(readStored('prefs', null, storage), { paletteId: 'neon', density: 1.5 });
  assert.deepEqual([...storage.map.keys()], ['fractal-explorer:prefs']);
  storage.map.set('prefs', '"another app"');
  assert.deepEqual(readStored('prefs', null, storage), { paletteId: 'neon', density: 1.5 });
});

test('missing keys and corrupt data give the fallback', () => {
  const storage = memoryStorage();
  assert.equal(readStored('nothing', 'fallback', storage), 'fallback');
  storage.map.set('fractal-explorer:broken', '{not json');
  assert.equal(readStored('broken', 42, storage), 42);
});

test('blocked, full or missing storage never throws', () => {
  const blocked = {
    getItem() {
      throw new Error('SecurityError');
    },
    setItem() {
      throw new Error('QuotaExceededError');
    },
  };
  assert.equal(readStored('prefs', 'fallback', blocked), 'fallback');
  assert.equal(writeStored('prefs', 1, blocked), false);
  assert.equal(readStored('prefs', 'fallback', null), 'fallback');
  assert.equal(writeStored('prefs', 1, null), false);
  assert.doesNotThrow(() => readStored('test-only-missing-key', 'fallback'));
});
