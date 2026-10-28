/**
 * Canvas painting shared by the main view, the Julia preview and the place
 * thumbnails: escape values in, coloured pixels out.
 */

import { colorize, buildCdf } from './color.js';
import { getPalette } from './palettes.js';

/**
 * @typedef {{paletteId: string, density: number, offset: number, coloring: 'smooth'|'histogram'}} ColorSettings
 */

/**
 * Colouring options for colorize() from the explorer state.
 * @param {ColorSettings} settings
 * @param {Float64Array|null} [cdf] distribution for histogram colouring
 * @returns {import('./color.js').Coloring}
 */
export function coloringOf(settings, cdf = null) {
  return {
    palette: /** @type {import('./palettes.js').Palette} */ (getPalette(settings.paletteId)),
    density: settings.density,
    offset: settings.offset,
    mode: settings.coloring,
    cdf,
  };
}

/**
 * Colours values into an ImageData and puts it on a canvas at (x, y).
 * @param {CanvasRenderingContext2D} ctx
 * @param {ImageData} image as large as the values
 * @param {ArrayLike<number>} values
 * @param {import('./color.js').Coloring} coloring
 * @param {number} [x]
 * @param {number} [y]
 */
export function paintImage(ctx, image, values, coloring, x = 0, y = 0) {
  colorize(values, image.data, coloring);
  ctx.putImageData(image, x, y);
}

/**
 * Paints a small picture that fills its canvas (Julia preview, thumbnails),
 * with its own histogram when histogram colouring is on.
 * @param {HTMLCanvasElement} canvas
 * @param {Float32Array} values canvas.width * canvas.height escape values
 * @param {ColorSettings} settings
 * @param {number} maxIter iteration limit the values were computed with
 */
export function paintPicture(canvas, values, settings, maxIter) {
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const cdf = settings.coloring === 'histogram' ? buildCdf(values, maxIter) : null;
  paintImage(ctx, ctx.createImageData(canvas.width, canvas.height), values, coloringOf(settings, cdf));
}
