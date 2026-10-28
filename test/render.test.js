import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTile, computeImage } from '../src/render.js';
import { createKernel, INSIDE } from '../src/fractals.js';
import { pixelToComplex } from '../src/view.js';
import { planRender } from '../src/tiles.js';

const MANDELBROT = { type: 'mandelbrot', maxIter: 200 };
const JULIA = { type: 'julia', maxIter: 200, cRe: -0.123, cIm: 0.745 };
const HOME = { cx: -0.75, cy: 0, scale: 2.8 };

/** Assembles tile results into one width x height image. */
function assemble(fractal, view, width, height, jobs) {
  const image = new Float32Array(width * height);
  for (const job of jobs) {
    const values = computeTile({ fractal, view, width, height, ...job });
    for (let row = 0; row < job.h; row++) {
      image.set(values.subarray(row * job.w, (row + 1) * job.w), (job.y + row) * width + job.x);
    }
  }
  return image;
}

test('a full-resolution tile holds the kernel value of every pixel centre', () => {
  const [width, height] = [96, 64];
  const tile = { x: 20, y: 10, w: 40, h: 30 };
  const values = computeTile({ fractal: MANDELBROT, view: HOME, width, height, ...tile, step: 1 });
  assert.equal(values.length, tile.w * tile.h);
  const kernel = createKernel(MANDELBROT);
  for (let row = 0; row < tile.h; row++) {
    for (let col = 0; col < tile.w; col++) {
      const { re, im } = pixelToComplex(HOME, width, height, tile.x + col + 0.5, tile.y + row + 0.5);
      assert.equal(values[row * tile.w + col], Math.fround(kernel(re, im)), `pixel ${col},${row}`);
    }
  }
});

test('tiles put together give exactly the whole image', () => {
  const [width, height] = [150, 100];
  for (const fractal of [MANDELBROT, JULIA]) {
    const view = fractal === JULIA ? { cx: 0, cy: 0, scale: 3 } : HOME;
    const jobs = planRender(width, height, { tileSize: 48, steps: [1] });
    const whole = computeImage(fractal, view, width, height);
    assert.equal(whole.length, width * height);
    assert.deepEqual(assemble(fractal, view, width, height, jobs), whole);
    const inside = whole.filter((v) => v === INSIDE).length;
    assert.ok(inside > 0 && inside < whole.length, fractal.type);
  }
});

test('a coarse pass fills each block with the value at the block centre', () => {
  const [width, height] = [96, 64];
  const tile = { x: 16, y: 8, w: 40, h: 30 };
  const step = 8;
  const values = computeTile({ fractal: MANDELBROT, view: HOME, width, height, ...tile, step });
  const kernel = createKernel(MANDELBROT);
  for (let top = 0; top < tile.h; top += step) {
    for (let left = 0; left < tile.w; left += step) {
      const blockWidth = Math.min(step, tile.w - left);
      const blockHeight = Math.min(step, tile.h - top);
      const centre = pixelToComplex(
        HOME, width, height, tile.x + left + blockWidth / 2, tile.y + top + blockHeight / 2,
      );
      const expected = Math.fround(kernel(centre.re, centre.im));
      for (let row = top; row < top + blockHeight; row++) {
        for (let col = left; col < left + blockWidth; col++) {
          assert.equal(values[row * tile.w + col], expected, `pixel ${col},${row}`);
        }
      }
    }
  }
});

test('a missing or invalid step means every pixel', () => {
  const base = { fractal: MANDELBROT, view: HOME, width: 40, height: 30, x: 0, y: 0, w: 40, h: 30 };
  const exact = computeTile({ ...base, step: 1 });
  assert.deepEqual(computeTile(base), exact);
  assert.deepEqual(computeTile({ ...base, step: 0 }), exact);
  assert.deepEqual(computeTile({ ...base, step: Number.NaN }), exact);
});

test('deep views stay exact: the periodicity check shrinks with the pixel size', () => {
  // Around c = i the set is a thin dendrite: almost every pixel escapes, but only
  // after its orbit has crept along a repelling cycle for dozens of iterations.
  const view = { cx: 0, cy: 1, scale: 1e-13 };
  const [width, height] = [32, 32];
  const fractal = { type: 'mandelbrot', maxIter: 300 };
  const values = computeImage(fractal, view, width, height);
  const plain = createKernel({ ...fractal, periodTolerance: 0 });
  const fixed = createKernel(fractal);
  let fixedWrong = 0;
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const { re, im } = pixelToComplex(view, width, height, px + 0.5, py + 0.5);
      const expected = plain(re, im);
      assert.equal(values[py * width + px], Math.fround(expected), `pixel ${px},${py}`);
      if ((fixed(re, im) === INSIDE) !== (expected === INSIDE)) fixedWrong++;
    }
  }
  assert.ok(fixedWrong > 0, 'a fixed tolerance would have painted escaping pixels as inside');
});
