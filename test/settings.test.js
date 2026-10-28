import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLORING_MODES,
  C_LIMIT,
  defaultSettings,
  normalizeJuliaC,
  sanitizeSettings,
  encodeHash,
  decodeHash,
} from '../src/settings.js';
import { getFractalType, MIN_ITERATIONS } from '../src/fractals.js';
import { MIN_SCALE } from '../src/view.js';
import { MAX_DENSITY } from '../src/color.js';

const JULIA_SETTINGS = {
  type: 'julia',
  view: { cx: -0.123456789012345, cy: 1 / 3, scale: 1.234e-11 },
  juliaC: { re: -0.7269, im: 0.1889 },
  paletteId: 'neon',
  density: 1.2,
  offset: 0.7,
  coloring: 'histogram',
  iterations: 2500,
};

test('default settings show the whole Mandelbrot set and are valid', () => {
  const settings = defaultSettings();
  assert.equal(settings.type, 'mandelbrot');
  assert.deepEqual(settings.view, getFractalType('mandelbrot').home);
  assert.equal(settings.iterations, 'auto');
  assert.ok(COLORING_MODES.includes(settings.coloring));
  assert.deepEqual(sanitizeSettings(settings), settings);
  assert.notEqual(defaultSettings().view, defaultSettings().view, 'a fresh object every time');
});

test('the share-link hash round-trips every field exactly', () => {
  const hash = encodeHash(JULIA_SETTINGS);
  assert.ok(hash.startsWith('#t=julia&'));
  assert.deepEqual(decodeHash(hash), JULIA_SETTINGS);
  assert.deepEqual(decodeHash(hash.slice(1)), JULIA_SETTINGS, 'the # is optional');
  const keys = [...new URLSearchParams(hash.slice(1)).keys()];
  for (const key of ['t', 'x', 'y', 's', 'cr', 'ci', 'p']) assert.ok(keys.includes(key), key);
});

test('the Julia constant is only part of Julia links', () => {
  const settings = defaultSettings();
  const hash = encodeHash(settings);
  assert.ok(!hash.includes('cr=') && !hash.includes('ci='));
  const { juliaC, ...rest } = settings;
  assert.ok(juliaC);
  assert.deepEqual(decodeHash(hash), rest);
});

test('broken or hostile hashes are ignored field by field', () => {
  assert.deepEqual(decodeHash(''), {});
  assert.deepEqual(decodeHash(undefined), {});
  assert.deepEqual(decodeHash('#t=nope&x=abc&s=-1&p=zzz&d=&m=wild&i=lots&o=Infinity'), {});
  assert.deepEqual(decodeHash('#t=__proto__&p=constructor&x=1e999&y=0&s=1'), {});
  assert.deepEqual(decodeHash('#t=tricorn'), { type: 'tricorn' });
  assert.deepEqual(decodeHash('#x=0&y=0&s=1e-30&d=100&o=1.25&i=5'), {
    view: { cx: 0, cy: 0, scale: MIN_SCALE },
    density: MAX_DENSITY,
    offset: 0.25,
    iterations: MIN_ITERATIONS,
  });
  assert.deepEqual(decodeHash('#t=julia&cr=9&ci=-0.5').juliaC, { re: C_LIMIT, im: -0.5 });
  assert.equal(decodeHash('#i=auto').iterations, 'auto');
});

test('untrusted settings objects keep only valid fields', () => {
  assert.deepEqual(sanitizeSettings(null), {});
  assert.deepEqual(sanitizeSettings('mandelbrot'), {});
  assert.deepEqual(sanitizeSettings({ density: '2', offset: null, coloring: 'SMOOTH', iterations: 'many' }), {});
  assert.deepEqual(sanitizeSettings({ density: 0.01, iterations: 1e9 }), { density: 0.1, iterations: 50000 });
  assert.deepEqual(normalizeJuliaC({ re: -10, im: 10 }), { re: -C_LIMIT, im: C_LIMIT });
  assert.equal(normalizeJuliaC({ re: Number.NaN, im: 0 }), null);
  assert.equal(normalizeJuliaC(null), null);
});
