import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canvasRatio, workerCount, MAX_PIXEL_RATIO, MAX_CANVAS_PIXELS, MAX_WORKERS } from '../src/display.js';

test('the canvas follows the device pixel ratio up to a cap', () => {
  assert.equal(canvasRatio(1, 1200, 800), 1);
  assert.equal(canvasRatio(2, 375, 667), 2);
  assert.equal(canvasRatio(3, 375, 667), MAX_PIXEL_RATIO);
  assert.equal(canvasRatio(Number.NaN, 375, 667), 1);
  assert.equal(canvasRatio(0, 375, 667), 1);
});

test('big screens render at a lower ratio so a frame stays within the pixel budget', () => {
  for (const [width, height] of [[2560, 1440], [3840, 2160], [7680, 4320]]) {
    const ratio = canvasRatio(2, width, height);
    assert.ok(ratio < MAX_PIXEL_RATIO);
    assert.ok(width * ratio * height * ratio <= MAX_CANVAS_PIXELS * (1 + 1e-9));
  }
});

test('one worker per core, minus one for the page, from 1 to 8', () => {
  assert.equal(workerCount(8), 7);
  assert.equal(workerCount(2), 1);
  assert.equal(workerCount(1), 1);
  assert.equal(workerCount(64), MAX_WORKERS);
  assert.equal(workerCount(undefined), 3, 'unknown core count: assume four');
  assert.equal(workerCount(Number.NaN), 3);
  assert.equal(workerCount(6.7), 5);
});
