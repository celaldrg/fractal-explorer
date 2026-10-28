/**
 * Small pictures of the famous places. They are computed one at a time while
 * the page is otherwise idle (or all at once for the ?demo frame) and painted
 * again in the current colours whenever the palette changes.
 */

import { computeImage } from './render.js';
import { paintPicture } from './paint.js';
import { getFractalType, resolveMaxIter } from './fractals.js';
import { zoomFactor } from './view.js';

/** Pause (ms) between two thumbnails so that input and the main render stay smooth. */
const IDLE_GAP = 30;

/**
 * @typedef {import('./places.js').Place} Place
 * @typedef {import('./paint.js').ColorSettings} ColorSettings
 * @typedef {{place: Place, canvas: HTMLCanvasElement, values: Float32Array|null, maxIter: number}} Thumbnail
 */

/**
 * The fractal parameters of a place at the automatic iteration limit.
 * @param {Place} place
 * @returns {import('./fractals.js').FractalParams}
 */
function placeFractal(place) {
  const type = /** @type {import('./fractals.js').FractalType} */ (getFractalType(place.type));
  const maxIter = resolveMaxIter('auto', zoomFactor(place.view, type.home));
  return { type: place.type, maxIter, cRe: place.c?.re ?? 0, cIm: place.c?.im ?? 0 };
}

/**
 * Creates the thumbnails of the given place canvases.
 * @param {Array<{place: Place, canvas: HTMLCanvasElement}>} entries
 */
export function createThumbnails(entries) {
  /** @type {Thumbnail[]} */
  const thumbnails = entries.map(({ place, canvas }) => ({ place, canvas, values: null, maxIter: 0 }));
  /** @type {ColorSettings|null} */
  let colors = null;
  let started = false;

  /** @param {Thumbnail} thumbnail */
  function compute(thumbnail) {
    const fractal = placeFractal(thumbnail.place);
    const { width, height } = thumbnail.canvas;
    thumbnail.values = computeImage(fractal, thumbnail.place.view, width, height);
    thumbnail.maxIter = fractal.maxIter;
  }

  /** @param {Thumbnail} thumbnail */
  function paint(thumbnail) {
    if (colors && thumbnail.values) paintPicture(thumbnail.canvas, thumbnail.values, colors, thumbnail.maxIter);
  }

  function computeNext() {
    const next = thumbnails.find((thumbnail) => !thumbnail.values);
    if (!next) return;
    compute(next);
    paint(next);
    setTimeout(computeNext, IDLE_GAP);
  }

  return {
    /**
     * Starts computing the thumbnails; later calls only recolour them.
     * @param {ColorSettings} settings current colouring
     * @param {boolean} [sync] compute every thumbnail now instead of in the background
     */
    start(settings, sync = false) {
      colors = settings;
      if (started) return;
      started = true;
      if (!sync) {
        setTimeout(computeNext, IDLE_GAP);
        return;
      }
      for (const thumbnail of thumbnails) {
        compute(thumbnail);
        paint(thumbnail);
      }
    },

    /**
     * Paints the computed thumbnails in new colours.
     * @param {ColorSettings} settings
     */
    recolor(settings) {
      colors = settings;
      for (const thumbnail of thumbnails) paint(thumbnail);
    },
  };
}
