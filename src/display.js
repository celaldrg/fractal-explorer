/**
 * Device-dependent caps: the canvas resolution and the number of render
 * workers. Pure functions of the numbers the browser reports.
 */

/** Highest device pixel ratio used for the canvas. */
export const MAX_PIXEL_RATIO = 2;

/** Most canvas pixels per frame; bigger screens render at a lower ratio. */
export const MAX_CANVAS_PIXELS = 4_000_000;

/** Most render workers. */
export const MAX_WORKERS = 8;

const DEFAULT_CORES = 4;

/**
 * Canvas pixels per CSS pixel for a canvas of the given CSS size: the device
 * pixel ratio, capped at MAX_PIXEL_RATIO and so the canvas stays within MAX_CANVAS_PIXELS.
 * @param {number} devicePixelRatio as reported by the browser
 * @param {number} cssWidth
 * @param {number} cssHeight
 * @returns {number}
 */
export function canvasRatio(devicePixelRatio, cssWidth, cssHeight) {
  const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const area = Math.max(1, cssWidth * cssHeight);
  return Math.min(ratio, MAX_PIXEL_RATIO, Math.sqrt(MAX_CANVAS_PIXELS / area));
}

/**
 * Number of render workers: one per logical core, minus one for the page, from 1 to MAX_WORKERS.
 * @param {number} [hardwareConcurrency] navigator.hardwareConcurrency
 * @returns {number}
 */
export function workerCount(hardwareConcurrency) {
  const cores =
    Number.isFinite(hardwareConcurrency) && /** @type {number} */ (hardwareConcurrency) > 0
      ? Math.floor(/** @type {number} */ (hardwareConcurrency))
      : DEFAULT_CORES;
  return Math.min(MAX_WORKERS, Math.max(1, cores - 1));
}
