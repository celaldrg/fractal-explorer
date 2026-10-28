import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTES, DEFAULT_PALETTE_ID, getPalette } from '../src/palettes.js';
import {
  LUT_SIZE,
  MIN_DENSITY,
  MAX_DENSITY,
  parseHex,
  samplePalette,
  buildLut,
  smoothPhase,
  buildCdf,
  cdfAt,
  colorize,
  clampDensity,
  wrapOffset,
} from '../src/color.js';
import { INSIDE } from '../src/fractals.js';

const HEX = /^#[0-9a-f]{6}$/;
const close = (a, b, tolerance, message) => assert.ok(Math.abs(a - b) <= tolerance, `${message}: ${a} vs ${b}`);

/** Colours a list of values and returns one [r, g, b, a] array per value. */
function paint(values, coloring) {
  const rgba = new Uint8ClampedArray(values.length * 4);
  colorize(Float32Array.from(values), rgba, coloring);
  return Array.from({ length: values.length }, (_, i) => [...rgba.subarray(i * 4, i * 4 + 4)]);
}

/** Lookup-table colour at palette position t (any real number), as [r, g, b, 255]. */
function lutColour(lut, t) {
  const k = Math.min(LUT_SIZE - 1, Math.floor((t - Math.floor(t)) * LUT_SIZE)) * 3;
  return [...lut.subarray(k, k + 3), 255];
}

test('at least eight palettes, each with an id, names in English and Turkish and valid stops', () => {
  assert.ok(PALETTES.length >= 8);
  assert.equal(new Set(PALETTES.map((palette) => palette.id)).size, PALETTES.length);
  assert.ok(getPalette(DEFAULT_PALETTE_ID));
  assert.equal(getPalette('nope'), null);
  for (const palette of PALETTES) {
    assert.ok(palette.name.en && palette.name.tr, palette.id);
    assert.match(palette.inside, HEX);
    assert.ok(palette.stops.length >= 2, palette.id);
    palette.stops.forEach(([position, hex], i) => {
      assert.match(hex, HEX);
      assert.ok(position >= 0 && position < 1, `${palette.id} stop ${i}`);
      if (i > 0) assert.ok(position > palette.stops[i - 1][0], `${palette.id} stops ascend`);
    });
  }
});

test('hex colours are parsed', () => {
  assert.deepEqual(parseHex('#e879f9'), [232, 121, 249]);
  assert.deepEqual(parseHex('#000000'), [0, 0, 0]);
  assert.deepEqual(parseHex('#ffffff'), [255, 255, 255]);
});

test('palette lookups are periodic', () => {
  for (const palette of PALETTES) {
    for (const t of [0, 0.1, 0.37, 0.5, 0.93]) {
      const base = samplePalette(palette, t);
      for (const shift of [1, 2, -1, -3, 17]) {
        const shifted = samplePalette(palette, t + shift);
        for (let k = 0; k < 3; k++) close(shifted[k], base[k], 1e-6, `${palette.id} at ${t} + ${shift}`);
      }
    }
  }
});

test('palette lookups hit the stops and interpolate linearly between them, round the wrap too', () => {
  for (const palette of PALETTES) {
    palette.stops.forEach(([position, hex], i) => {
      const a = parseHex(hex);
      assert.deepEqual(samplePalette(palette, position), a, `${palette.id} stop ${i}`);
      const [nextPosition, nextHex] = palette.stops[(i + 1) % palette.stops.length];
      const b = parseHex(nextHex);
      const end = nextPosition > position ? nextPosition : nextPosition + 1;
      for (const f of [0.25, 0.5, 0.9]) {
        const sample = samplePalette(palette, position + (end - position) * f);
        for (let k = 0; k < 3; k++) close(sample[k], a[k] + (b[k] - a[k]) * f, 1e-6, `${palette.id} segment ${i}`);
      }
    });
  }
});

test('the lookup table holds rounded, evenly spaced samples', () => {
  const palette = getPalette('orchid');
  assert.equal(buildLut(palette).length, LUT_SIZE * 3);
  const lut = buildLut(palette, 16);
  for (let k = 0; k < 16; k++) {
    const expected = samplePalette(palette, k / 16).map(Math.round);
    assert.deepEqual([...lut.subarray(k * 3, k * 3 + 3)], expected);
  }
});

test('colorize paints the inside colour, opaque pixels and the smooth cyclic mapping', () => {
  const palette = getPalette('aurora');
  const first = parseHex(palette.stops[0][1]);
  const [inside, atStart, quarter, half] = paint([INSIDE, 4, 9, 16], { palette });
  assert.deepEqual(inside, [...parseHex(palette.inside), 255]);
  assert.deepEqual(atStart, [...first, 255], 'a count of 4 sits at the start of the palette');
  const lut = buildLut(palette);
  assert.deepEqual(quarter, lutColour(lut, 0.25));
  assert.deepEqual(half, lutColour(lut, 0.5));
  assert.ok(smoothPhase(100) > smoothPhase(50) && smoothPhase(4) === 0);
});

test('offset shifts and density stretches the palette, with period 1', () => {
  const palette = getPalette('neon');
  const values = [4, 6.25, 9, 16, 25, 36, 1234.5];
  const plain = paint(values, { palette });
  assert.deepEqual(paint(values, { palette, offset: 1 }), plain);
  assert.deepEqual(paint(values, { palette, offset: -2 }), plain);
  // 9 sits a quarter cycle after 4, 16 half a cycle after it.
  assert.deepEqual(paint([4], { palette, offset: 0.25 })[0], plain[2]);
  assert.deepEqual(paint([9], { palette, density: 2 })[0], plain[3]);
  assert.deepEqual(paint([36], { palette })[0], plain[0], '36 is one full cycle after 4');
});

test('histogram colouring spreads the counts evenly over the palette', () => {
  const values = [INSIDE, 0.5, 1.5, 1.7, 3.2, INSIDE, 10];
  const cdf = buildCdf(values, 10);
  assert.deepEqual([...cdf], [0, 0.2, 0.6, 0.6, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 1]);
  close(cdfAt(cdf, 1.5), 0.4, 1e-12, 'interpolated inside a bin');
  assert.equal(cdfAt(cdf, -3), 0);
  assert.equal(cdfAt(cdf, 1e6), 1);
  let previous = 0;
  for (let v = 0; v <= 12; v += 0.05) {
    assert.ok(cdfAt(cdf, v) >= previous);
    previous = cdfAt(cdf, v);
  }
  assert.ok(buildCdf([INSIDE, INSIDE], 5).every((share) => share === 0), 'nothing escaped');

  const palette = getPalette('ember');
  const colours = paint(values, { palette, mode: 'histogram', cdf });
  const lut = buildLut(palette);
  values.forEach((v, i) => {
    const expected = v < 0 ? [...parseHex(palette.inside), 255] : lutColour(lut, cdfAt(cdf, Math.fround(v)));
    assert.deepEqual(colours[i], expected, `value ${v}`);
  });
  assert.deepEqual(paint(values, { palette, mode: 'histogram', cdf: null }), paint(values, { palette }), 'no distribution: smooth');
});

test('density and offset are kept in range', () => {
  assert.equal(clampDensity(0), MIN_DENSITY);
  assert.equal(clampDensity(100), MAX_DENSITY);
  assert.equal(clampDensity(2.5), 2.5);
  assert.equal(wrapOffset(1.25), 0.25);
  assert.equal(wrapOffset(-0.25), 0.75);
  assert.equal(wrapOffset(0), 0);
});
