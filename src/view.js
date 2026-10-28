/**
 * View model: which part of the complex plane is on screen.
 *
 * A view is { cx, cy, scale }: the centre of the screen and the length of the
 * screen's shorter side in the complex plane. Because the scale refers to the
 * shorter side, the same view works for any canvas size, which keeps share links
 * portable. Pixel coordinates are continuous: (0, 0) is the top-left corner,
 * (width, height) the bottom-right one, and pixel i has its centre at i + 0.5.
 * The imaginary axis points up.
 */

/** Smallest scale: double precision has nothing left to show below this. */
export const MIN_SCALE = 1e-15;

/** Largest scale (zoomed far out). */
export const MAX_SCALE = 32;

/** Below this scale neighbouring pixels start to share the same double value. */
export const PRECISION_LIMIT = 1e-13;

/** The centre is kept inside [-CENTER_LIMIT, CENTER_LIMIT] on both axes. */
export const CENTER_LIMIT = 8;

/**
 * @typedef {Object} View
 * @property {number} cx real part of the screen centre
 * @property {number} cy imaginary part of the screen centre
 * @property {number} scale complex length of the shorter screen side
 */

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Clamps a scale to [MIN_SCALE, MAX_SCALE].
 * @param {number} scale
 * @returns {number}
 */
export function clampScale(scale) {
  return clamp(scale, MIN_SCALE, MAX_SCALE);
}

/**
 * @param {number} cx
 * @param {number} cy
 * @param {number} scale
 * @returns {View}
 */
function makeView(cx, cy, scale) {
  return {
    cx: clamp(cx, -CENTER_LIMIT, CENTER_LIMIT),
    cy: clamp(cy, -CENTER_LIMIT, CENTER_LIMIT),
    scale: clampScale(scale),
  };
}

/**
 * Validates an untrusted view and returns a clamped copy, or null when it is unusable.
 * @param {unknown} view
 * @returns {View|null}
 */
export function normalizeView(view) {
  if (!view || typeof view !== 'object') return null;
  const { cx, cy, scale } = /** @type {View} */ (view);
  if (![cx, cy, scale].every(Number.isFinite) || scale <= 0) return null;
  return makeView(cx, cy, scale);
}

/**
 * Shorter side of the screen in pixels (at least 1).
 * @param {number} width
 * @param {number} height
 * @returns {number}
 */
function shorterSide(width, height) {
  return Math.max(1, Math.min(width, height));
}

/**
 * Complex length of one pixel.
 * @param {View} view
 * @param {number} width
 * @param {number} height
 * @returns {number}
 */
export function pixelSize(view, width, height) {
  return view.scale / shorterSide(width, height);
}

/**
 * Maps a pixel position to the complex plane.
 * @param {View} view
 * @param {number} width
 * @param {number} height
 * @param {number} px
 * @param {number} py
 * @returns {{re: number, im: number}}
 */
export function pixelToComplex(view, width, height, px, py) {
  const unit = pixelSize(view, width, height);
  return { re: view.cx + (px - width / 2) * unit, im: view.cy - (py - height / 2) * unit };
}

/**
 * Maps a complex number to a pixel position (inverse of pixelToComplex).
 * @param {View} view
 * @param {number} width
 * @param {number} height
 * @param {number} re
 * @param {number} im
 * @returns {{x: number, y: number}}
 */
export function complexToPixel(view, width, height, re, im) {
  const unit = pixelSize(view, width, height);
  return { x: width / 2 + (re - view.cx) / unit, y: height / 2 - (im - view.cy) / unit };
}

/**
 * Moves the picture by (dx, dy) pixels, as when dragging it.
 * @param {View} view
 * @param {number} width
 * @param {number} height
 * @param {number} dx
 * @param {number} dy
 * @returns {View}
 */
export function panView(view, width, height, dx, dy) {
  const unit = pixelSize(view, width, height);
  return makeView(view.cx - dx * unit, view.cy + dy * unit, view.scale);
}

/**
 * Zooms by `factor` (> 1 zooms in) while the point under (px, py) stays put.
 * @param {View} view
 * @param {number} width
 * @param {number} height
 * @param {number} px
 * @param {number} py
 * @param {number} factor
 * @returns {View}
 */
export function zoomView(view, width, height, px, py, factor) {
  const anchor = pixelToComplex(view, width, height, px, py);
  const scale = clampScale(view.scale / factor);
  const unit = scale / shorterSide(width, height);
  return makeView(anchor.re - (px - width / 2) * unit, anchor.im + (py - height / 2) * unit, scale);
}

/**
 * Zooms so that the pixel rectangle between two corners fills the screen.
 * @param {View} view
 * @param {number} width
 * @param {number} height
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @returns {View}
 */
export function zoomToRect(view, width, height, x0, y0, x1, y1) {
  const boxWidth = Math.max(1, Math.abs(x1 - x0));
  const boxHeight = Math.max(1, Math.abs(y1 - y0));
  const center = pixelToComplex(view, width, height, (x0 + x1) / 2, (y0 + y1) / 2);
  const ratio = Math.max(boxWidth / Math.max(1, width), boxHeight / Math.max(1, height));
  return makeView(center.re, center.im, view.scale * ratio);
}

/**
 * Where an image drawn for one view lands on a screen that shows another view:
 * pixel (px, py) of the old image belongs at (x + px * scale, y + py * scale).
 * The renderer uses it to show the last frame moved and scaled at once while
 * the new frame is computed.
 * @param {View} from view of the old image
 * @param {number} fromWidth
 * @param {number} fromHeight
 * @param {View} to view on screen now
 * @param {number} toWidth
 * @param {number} toHeight
 * @returns {{x: number, y: number, scale: number}}
 */
export function frameTransform(from, fromWidth, fromHeight, to, toWidth, toHeight) {
  const corner = pixelToComplex(from, fromWidth, fromHeight, 0, 0);
  const origin = complexToPixel(to, toWidth, toHeight, corner.re, corner.im);
  const scale = pixelSize(from, fromWidth, fromHeight) / pixelSize(to, toWidth, toHeight);
  return { x: origin.x, y: origin.y, scale };
}

/**
 * Zoom factor of a view relative to a reference (home) view.
 * @param {View} view
 * @param {View} home
 * @returns {number}
 */
export function zoomFactor(view, home) {
  return home.scale / view.scale;
}

/**
 * True when the view is so deep that double precision visibly breaks down.
 * @param {View} view
 * @returns {boolean}
 */
export function isPrecisionLimited(view) {
  return view.scale < PRECISION_LIMIT;
}
