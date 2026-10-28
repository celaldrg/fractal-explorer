/**
 * Computes escape values for rectangular parts of an image. Used by the render
 * workers for tiles and on the main thread for small synchronous images.
 */

import { createKernel, PERIOD_TOLERANCE } from './fractals.js';
import { pixelSize } from './view.js';

/**
 * @typedef {Object} RenderJob
 * @property {import('./fractals.js').FractalParams} fractal what to draw
 * @property {import('./view.js').View} view where to look
 * @property {number} width full image width in pixels
 * @property {number} height full image height in pixels
 * @property {number} x left edge of the region
 * @property {number} y top edge of the region
 * @property {number} w region width
 * @property {number} h region height
 * @property {number} [step] sampling step: one sample fills a step x step block (1 = every pixel)
 */

/**
 * Writes one value into a block of a row-major buffer.
 * @param {Float32Array} values
 * @param {number} stride
 * @param {number} left
 * @param {number} top
 * @param {number} blockWidth
 * @param {number} blockHeight
 * @param {number} value
 */
function fillBlock(values, stride, left, top, blockWidth, blockHeight, value) {
  for (let row = top; row < top + blockHeight; row++) {
    const start = row * stride + left;
    values.fill(value, start, start + blockWidth);
  }
}

/**
 * Computes the smooth escape values of a region (row-major, w * h entries, INSIDE
 * for points that never escaped). With step > 1 the region is sampled once per
 * step x step block, at the block centre, which gives a quick coarse preview.
 * The periodicity tolerance shrinks with the pixel size so deep views stay exact.
 * @param {RenderJob} job
 * @returns {Float32Array}
 */
export function computeTile(job) {
  const { view, width, height, x, y, w, h } = job;
  const step = job.step >= 1 ? Math.floor(job.step) : 1;
  const unit = pixelSize(view, width, height);
  const kernel = createKernel({
    periodTolerance: Math.min(PERIOD_TOLERANCE, unit * 1e-3),
    ...job.fractal,
  });
  const values = new Float32Array(w * h);
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  for (let top = 0; top < h; top += step) {
    const blockHeight = Math.min(step, h - top);
    const im = view.cy - (y + top + blockHeight / 2 - halfHeight) * unit;
    for (let left = 0; left < w; left += step) {
      const blockWidth = Math.min(step, w - left);
      const re = view.cx + (x + left + blockWidth / 2 - halfWidth) * unit;
      const value = kernel(re, im);
      if (step === 1) values[top * w + left] = value;
      else fillBlock(values, w, left, top, blockWidth, blockHeight, value);
    }
  }
  return values;
}

/**
 * Computes a whole image in one go (for previews and the synchronous demo frame).
 * @param {import('./fractals.js').FractalParams} fractal
 * @param {import('./view.js').View} view
 * @param {number} width
 * @param {number} height
 * @returns {Float32Array}
 */
export function computeImage(fractal, view, width, height) {
  return computeTile({ fractal, view, width, height, x: 0, y: 0, w: width, h: height, step: 1 });
}
