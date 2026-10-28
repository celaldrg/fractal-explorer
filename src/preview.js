/**
 * The Julia picker's live mini preview: a small canvas in a corner showing the
 * Julia set of the point under the pointer. At most one preview is drawn per
 * animation frame, always for the latest point.
 */

import { computeImage } from './render.js';
import { paintPicture } from './paint.js';
import { formatComplex } from './format.js';

/** Precision of the c shown under the preview. */
const CAPTION_UNIT = 1e-4;

/**
 * @typedef {{c: {re: number, im: number}, fractal: import('./fractals.js').FractalParams, view: import('./view.js').View}} PreviewTarget
 * @typedef {import('./paint.js').ColorSettings} ColorSettings
 */

/**
 * Creates the preview.
 * @param {HTMLElement} container shown while the picker is on
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLElement} caption receives the value of c
 */
export function createPreview(container, canvas, caption) {
  /** @type {{target: PreviewTarget, settings: ColorSettings}|null} */
  let pending = null;
  let scheduled = false;

  function draw() {
    scheduled = false;
    if (!pending || container.hidden) return;
    const { target, settings } = pending;
    pending = null;
    const values = computeImage(target.fractal, target.view, canvas.width, canvas.height);
    paintPicture(canvas, values, settings, target.fractal.maxIter);
    caption.textContent = `c = ${formatComplex(target.c.re, target.c.im, CAPTION_UNIT)}`;
  }

  return {
    /**
     * Queues a preview of a point.
     * @param {PreviewTarget|null} target from explorer.juliaPreview(); null is ignored
     * @param {ColorSettings} settings current colouring
     */
    show(target, settings) {
      if (!target) return;
      pending = { target, settings };
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(draw);
    },

    /** @param {boolean} visible */
    setVisible(visible) {
      container.hidden = !visible;
    },
  };
}
