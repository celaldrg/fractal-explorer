import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  coordinateDigits,
  formatComplex,
  formatZoom,
  formatInteger,
  formatDecimal,
  formatDuration,
  percentOf,
} from '../src/format.js';

test('coordinates get just enough digits to tell neighbouring pixels apart', () => {
  assert.equal(coordinateDigits(1e-3), 4);
  assert.equal(coordinateDigits(5.25e-6), 7);
  assert.equal(coordinateDigits(0.5), 2, 'never fewer than two');
  assert.equal(coordinateDigits(1e-20), 16, 'never more than double precision holds');
  assert.equal(coordinateDigits(0), 16);
});

test('complex numbers read like "−0.74420 + 0.13020i"', () => {
  assert.equal(formatComplex(-0.7442, 0.1302, 1e-4), '−0.74420 + 0.13020i');
  assert.equal(formatComplex(0.25, -1.5, 1e-2), '0.250 − 1.500i');
  assert.equal(formatComplex(-0.0001, -0.0001, 0.5), '0.00 + 0.00i', 'no minus on a rounded zero');
});

test('zoom factors are short in both languages', () => {
  assert.equal(formatZoom(1, 'en'), '×1');
  assert.equal(formatZoom(1.5, 'en'), '×1.5');
  assert.equal(formatZoom(2.8 / 0.0042, 'en'), '×667');
  assert.equal(formatZoom(12345, 'en'), '×12,300');
  assert.equal(formatZoom(12345, 'tr'), '×12.300');
  assert.equal(formatZoom(0.5, 'tr'), '×0,5');
  assert.equal(formatZoom(2.5e13, 'en'), '×2.5e13');
  assert.equal(formatZoom(2.5e13, 'tr'), '×2,5e13');
  assert.equal(formatZoom(9.96e6, 'en'), '×1.0e7', 'the mantissa rounds up into the next power');
});

test('integers, decimals, durations and percentages', () => {
  assert.equal(formatInteger(1069, 'en'), '1,069');
  assert.equal(formatInteger(1069, 'tr'), '1.069');
  assert.equal(formatInteger(15.6, 'en'), '16');
  assert.equal(formatDecimal(1.2, 2, 'en'), '1.20');
  assert.equal(formatDecimal(1.2, 2, 'tr'), '1,20');
  assert.equal(formatDuration(312.4, 'en'), '312 ms');
  assert.equal(formatDuration(1460, 'en'), '1.5 s');
  assert.equal(formatDuration(1460, 'tr'), '1,5 s');
  assert.equal(formatDuration(0, 'en'), '<1 ms', 'a frozen clock still shows a time');
  assert.equal(formatDuration(0.3, 'tr'), '<1 ms');
  assert.equal(formatDuration(0.6, 'en'), '1 ms');
  assert.equal(formatDuration(Number.NaN, 'tr'), '–', 'no measurement');
  assert.equal(formatDuration(-2, 'en'), '–');
  assert.equal(percentOf(0.999), 99);
  assert.equal(percentOf(1), 100);
  assert.equal(percentOf(-0.2), 0);
  assert.equal(percentOf(3), 100);
});
