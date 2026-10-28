import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_SCALE,
  MAX_SCALE,
  PRECISION_LIMIT,
  CENTER_LIMIT,
  clampScale,
  normalizeView,
  pixelSize,
  pixelToComplex,
  complexToPixel,
  panView,
  zoomView,
  zoomToRect,
  zoomFactor,
  isPrecisionLimited,
} from '../src/view.js';

const VIEWS = [
  { cx: -0.75, cy: 0, scale: 2.8 },
  { cx: -0.7442, cy: 0.1302, scale: 0.0042 },
  { cx: 0.2935, cy: 0.016, scale: 1e-7 },
];
const SIZES = [
  [1000, 700],
  [375, 667],
  [64, 64],
];

const close = (a, b, tolerance, message) => assert.ok(Math.abs(a - b) <= tolerance, `${message}: ${a} vs ${b}`);

test('pixel <-> complex mapping round-trips', () => {
  for (const view of VIEWS) {
    for (const [width, height] of SIZES) {
      for (const [px, py] of [[0, 0], [width, height], [width / 3, height * 0.8], [17.25, 3.5]]) {
        const c = pixelToComplex(view, width, height, px, py);
        const back = complexToPixel(view, width, height, c.re, c.im);
        close(back.x, px, 1e-6, 'x');
        close(back.y, py, 1e-6, 'y');
        const again = pixelToComplex(view, width, height, back.x, back.y);
        close(again.re, c.re, view.scale * 1e-12, 're');
        close(again.im, c.im, view.scale * 1e-12, 'im');
      }
    }
  }
});

test('mapping puts the centre in the middle, the scale on the shorter side and the imaginary axis up', () => {
  const view = { cx: 1, cy: -2, scale: 4 };
  assert.deepEqual(pixelToComplex(view, 800, 400, 400, 200), { re: 1, im: -2 });
  assert.equal(pixelSize(view, 800, 400), 0.01);
  assert.equal(pixelSize(view, 400, 800), 0.01);
  assert.deepEqual(pixelToComplex(view, 800, 400, 400, 0), { re: 1, im: 0 });
  assert.deepEqual(pixelToComplex(view, 800, 400, 0, 200), { re: -3, im: -2 });
});

test('zooming keeps the point under the pointer fixed', () => {
  for (const view of VIEWS) {
    for (const factor of [2, 0.5, 1.1]) {
      const [width, height, px, py] = [900, 600, 123, 456];
      const before = pixelToComplex(view, width, height, px, py);
      const zoomed = zoomView(view, width, height, px, py, factor);
      const after = pixelToComplex(zoomed, width, height, px, py);
      close(zoomed.scale, view.scale / factor, view.scale * 1e-12, 'scale');
      close(after.re, before.re, view.scale * 1e-9, 're');
      close(after.im, before.im, view.scale * 1e-9, 'im');
    }
  }
});

test('panning moves the picture with the pointer', () => {
  const view = VIEWS[1];
  const [width, height] = [800, 600];
  const grabbed = pixelToComplex(view, width, height, 100, 100);
  const moved = panView(view, width, height, 40, -25);
  const now = complexToPixel(moved, width, height, grabbed.re, grabbed.im);
  close(now.x, 140, 1e-6, 'x');
  close(now.y, 75, 1e-6, 'y');
  assert.equal(moved.scale, view.scale);
});

test('zoom box: the box fills the screen, centred', () => {
  const view = { cx: -0.5, cy: 0, scale: 3 };
  const [width, height] = [1000, 500];
  const zoomed = zoomToRect(view, width, height, 300, 100, 500, 150);
  const centre = pixelToComplex(view, width, height, 400, 125);
  close(zoomed.cx, centre.re, 1e-12, 'cx');
  close(zoomed.cy, centre.im, 1e-12, 'cy');
  close(zoomed.scale, 3 * (200 / 1000), 1e-12, 'scale follows the wider side of the box');
  // The box corners land inside the new screen; one pair of edges touches it.
  const corner = pixelToComplex(view, width, height, 300, 100);
  const onScreen = complexToPixel(zoomed, width, height, corner.re, corner.im);
  close(onScreen.x, 0, 1e-6, 'left edge');
  assert.ok(onScreen.y >= 0 && onScreen.y <= height);
  // Corners given in any order give the same result; a click gives a 1-pixel box.
  assert.deepEqual(zoomToRect(view, width, height, 500, 150, 300, 100), zoomed);
  assert.ok(zoomToRect(view, width, height, 10, 10, 10, 10).scale > 0);
});

test('scale and centre are clamped; invalid views are rejected', () => {
  assert.equal(clampScale(0), MIN_SCALE);
  assert.equal(clampScale(1e9), MAX_SCALE);
  assert.equal(clampScale(1), 1);
  assert.equal(zoomView({ cx: 0, cy: 0, scale: MIN_SCALE }, 100, 100, 50, 50, 10).scale, MIN_SCALE);
  assert.equal(panView({ cx: 0, cy: 0, scale: 1 }, 100, 100, -1e6, 0).cx, CENTER_LIMIT);
  assert.deepEqual(normalizeView({ cx: 1, cy: 2, scale: 3 }), { cx: 1, cy: 2, scale: 3 });
  assert.deepEqual(normalizeView({ cx: 99, cy: -99, scale: 1e-40 }), { cx: CENTER_LIMIT, cy: -CENTER_LIMIT, scale: MIN_SCALE });
  for (const bad of [null, 'view', {}, { cx: 0, cy: 0, scale: 0 }, { cx: 0, cy: Number.NaN, scale: 1 }, { cx: 0, cy: 0, scale: -1 }]) {
    assert.equal(normalizeView(bad), null);
  }
});

test('precision notice starts below about 1e-13 and zoom factor is relative to home', () => {
  assert.ok(PRECISION_LIMIT >= 1e-14 && PRECISION_LIMIT <= 1e-12);
  assert.equal(isPrecisionLimited({ cx: 0, cy: 0, scale: 1e-12 }), false);
  assert.equal(isPrecisionLimited({ cx: 0, cy: 0, scale: 5e-14 }), true);
  close(zoomFactor({ cx: 0, cy: 0, scale: 0.028 }, { cx: 0, cy: 0, scale: 2.8 }), 100, 1e-9, 'zoom');
});
