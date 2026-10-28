import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer } from '../src/renderer.js';
import { createExplorer } from '../src/explorer.js';
import { computeTile, computeImage } from '../src/render.js';
import { colorize, buildCdf } from '../src/color.js';
import { coloringOf } from '../src/paint.js';

const WIDTH = 300;
const HEIGHT = 200;

/**
 * A canvas whose 2D context records every putImageData call.
 * @param {Array<{x: number, y: number, w: number, h: number, data: Uint8ClampedArray}>} puts
 */
function fakeCanvas(puts) {
  const ctx = {
    fillStyle: '',
    fillRect() {},
    drawImage() {},
    createImageData: (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
    putImageData: (image, x, y) => puts.push({ x, y, w: image.width, h: image.height, data: image.data.slice() }),
  };
  return { width: 0, height: 0, getContext: () => ctx };
}

/**
 * Whether two pixel buffers hold the same bytes (cheap to report, unlike a diff).
 * @param {Uint8ClampedArray} a
 * @param {Uint8ClampedArray} b
 */
function sameBytes(a, b) {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

/**
 * The colours of some escape values.
 * @param {Float32Array} values
 * @param {import('../src/explorer.js').ExplorerState} state
 * @param {Float64Array|null} cdf
 */
function colours(values, state, cdf) {
  const rgba = new Uint8ClampedArray(values.length * 4);
  colorize(values, rgba, coloringOf(state, cdf));
  return rgba;
}

test('switching to histogram colouring during the first pass never shows smooth colours', async (t) => {
  t.mock.method(console, 'warn', () => {}); // Node has no Web Workers: tiles are computed on this thread
  globalThis.document = { createElement: () => fakeCanvas([]) };
  t.after(() => delete globalThis.document);

  const explorer = createExplorer();
  const smooth = explorer.getState();
  explorer.setColoring('histogram');
  const histogram = explorer.getState();
  const puts = [];
  let switchedAt = -1;
  /** @type {ReturnType<typeof createRenderer>} */
  let renderer;
  await new Promise((resolve) => {
    renderer = createRenderer(/** @type {any} */ (fakeCanvas(puts)), {
      onProgress(fraction) {
        if (fraction === 0 || switchedAt >= 0) return;
        switchedAt = puts.length; // the first coarse tile is in, the image is not covered yet
        renderer.recolor(histogram);
      },
      onComplete: resolve,
    });
    renderer.resize(WIDTH, HEIGHT, 1);
    renderer.render(smooth);
  });

  const repaint = puts[switchedAt];
  assert.ok(repaint.w < WIDTH && repaint.h <= HEIGHT, 'the computed tile is painted again on its own');
  const { fractal, view, maxIter } = histogram;
  const { x, y, w, h } = repaint;
  const tileValues = computeTile({ fractal, view, width: WIDTH, height: HEIGHT, x, y, w, h, step: 8 });
  const tileHistogram = colours(tileValues, histogram, buildCdf(tileValues, maxIter));
  assert.ok(sameBytes(repaint.data, tileHistogram), 'histogram colours from the tiles computed so far');
  assert.ok(!sameBytes(repaint.data, colours(tileValues, smooth, null)), 'not smooth colours');

  const values = computeImage(fractal, view, WIDTH, HEIGHT);
  const final = puts.at(-1);
  assert.deepEqual([final.w, final.h], [WIDTH, HEIGHT]);
  assert.ok(sameBytes(final.data, colours(values, histogram, buildCdf(values, maxIter))), 'the finished frame');
});
