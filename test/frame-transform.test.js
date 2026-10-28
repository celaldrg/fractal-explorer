import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameTransform, complexToPixel, pixelToComplex, zoomView, panView } from '../src/view.js';

const HOME = { cx: -0.75, cy: 0, scale: 2.8 };

/** Checks that old pixels land where the new view shows the same complex point. */
function assertLandsRight(from, fromWidth, fromHeight, to, toWidth, toHeight) {
  const { x, y, scale } = frameTransform(from, fromWidth, fromHeight, to, toWidth, toHeight);
  for (const [px, py] of [[0, 0], [fromWidth, fromHeight], [17.5, 230], [fromWidth / 2, 3]]) {
    const point = pixelToComplex(from, fromWidth, fromHeight, px, py);
    const expected = complexToPixel(to, toWidth, toHeight, point.re, point.im);
    assert.ok(Math.abs(x + px * scale - expected.x) < 1e-6, `x of ${px},${py}`);
    assert.ok(Math.abs(y + py * scale - expected.y) < 1e-6, `y of ${px},${py}`);
  }
}

test('an unchanged view and size leave the frame where it is', () => {
  const { x, y, scale } = frameTransform(HOME, 800, 600, HOME, 800, 600);
  assert.ok(Math.abs(x) < 1e-9 && Math.abs(y) < 1e-9);
  assert.equal(scale, 1);
});

test('zooming in by 2 around the centre doubles the old frame around the centre', () => {
  const to = zoomView(HOME, 800, 600, 400, 300, 2);
  const { x, y, scale } = frameTransform(HOME, 800, 600, to, 800, 600);
  assert.ok(Math.abs(scale - 2) < 1e-12);
  assert.ok(Math.abs(x + 400) < 1e-9 && Math.abs(y + 300) < 1e-9);
});

test('pans, zooms around any point and resizes all line up', () => {
  assertLandsRight(HOME, 800, 600, panView(HOME, 800, 600, 37, -12), 800, 600);
  assertLandsRight(HOME, 800, 600, zoomView(HOME, 800, 600, 120, 470, 3.7), 800, 600);
  assertLandsRight(HOME, 800, 600, zoomView(HOME, 800, 600, 600, 100, 0.4), 800, 600);
  assertLandsRight(HOME, 800, 600, HOME, 1280, 720);
  assertLandsRight({ cx: -0.7442, cy: 0.1302, scale: 0.0042 }, 750, 1334, { cx: -0.7441, cy: 0.13, scale: 0.002 }, 1334, 750);
});
