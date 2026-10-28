/**
 * Pure helpers that turn raw input into explorer steps: wheel zoom factors,
 * pinch steps, tap and double-tap detection, and keyboard commands. They take
 * plain numbers and objects, so the tests drive them without a browser.
 */

/** Zoom factor of one keyboard, toolbar, double-click or double-tap step. */
export const ZOOM_STEP = 2;

/** Share of the shorter screen side that one arrow key press pans. */
export const PAN_FRACTION = 0.15;

/** Largest movement (CSS pixels) of a press that still counts as a tap. */
export const TAP_MAX_MOVE = 10;

/** Longest press (ms) that still counts as a tap. */
export const TAP_MAX_TIME = 350;

/** Longest gap (ms) between the two taps of a double tap. */
export const DOUBLE_TAP_TIME = 320;

/** Largest distance (CSS pixels) between the two taps of a double tap. */
export const DOUBLE_TAP_DISTANCE = 32;

const WHEEL_RATE = 0.0015;
const WHEEL_PINCH_RATE = 0.01;
const WHEEL_LINE = 16;
const MAX_WHEEL_FACTOR = 2;

/** @type {Record<string, string>} */
const KEY_COMMANDS = {
  ArrowLeft: 'pan-left',
  ArrowRight: 'pan-right',
  ArrowUp: 'pan-up',
  ArrowDown: 'pan-down',
  '+': 'zoom-in',
  '=': 'zoom-in',
  '-': 'zoom-out',
  _: 'zoom-out',
  0: 'reset',
  j: 'julia',
  J: 'julia',
  Backspace: 'back',
  Escape: 'escape',
};

/**
 * @typedef {Object} Point
 * @property {number} x
 * @property {number} y
 * @property {number} [time] milliseconds
 */

/**
 * Zoom factor of one wheel event (> 1 zooms in). Line and page deltas are
 * turned into pixels; a ctrl-wheel (a trackpad pinch) zooms faster.
 * @param {{deltaY: number, deltaMode?: number, ctrlKey?: boolean}} wheel
 * @param {number} pageHeight CSS pixels of one page
 * @returns {number} between 1/2 and 2
 */
export function wheelZoomFactor({ deltaY, deltaMode = 0, ctrlKey = false }, pageHeight) {
  const unit = deltaMode === 1 ? WHEEL_LINE : deltaMode === 2 ? pageHeight : 1;
  const factor = Math.exp(-deltaY * unit * (ctrlKey ? WHEEL_PINCH_RATE : WHEEL_RATE));
  if (!Number.isFinite(factor)) return deltaY > 0 ? 1 / MAX_WHEEL_FACTOR : MAX_WHEEL_FACTOR;
  return Math.min(MAX_WHEEL_FACTOR, Math.max(1 / MAX_WHEEL_FACTOR, factor));
}

/**
 * @param {Point} a
 * @param {Point} b
 * @returns {number}
 */
function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * One step of a two-finger pinch from fingers (a0, b0) to (a1, b1): zoom by
 * `factor` around (x, y), then pan by (dx, dy) so the midpoint follows the fingers.
 * @param {Point} a0
 * @param {Point} b0
 * @param {Point} a1
 * @param {Point} b1
 * @returns {{factor: number, x: number, y: number, dx: number, dy: number}}
 */
export function pinchStep(a0, b0, a1, b1) {
  const before = distance(a0, b0);
  const after = distance(a1, b1);
  const x = (a0.x + b0.x) / 2;
  const y = (a0.y + b0.y) / 2;
  return {
    factor: before > 0 && after > 0 ? after / before : 1,
    x,
    y,
    dx: (a1.x + b1.x) / 2 - x,
    dy: (a1.y + b1.y) / 2 - y,
  };
}

/**
 * True when a press from `down` to `up` was short and still enough to be a tap.
 * @param {Point} down
 * @param {Point} up
 * @returns {boolean}
 */
export function isTap(down, up) {
  return distance(down, up) <= TAP_MAX_MOVE && (up.time ?? 0) - (down.time ?? 0) <= TAP_MAX_TIME;
}

/**
 * Remembers the last tap so that a second one close in time and place makes a double tap.
 * @returns {{tap(point: Point): boolean, reset(): void}}
 */
export function createTapDetector() {
  /** @type {Point|null} */
  let last = null;
  return {
    /**
     * Registers a tap.
     * @param {Point} point
     * @returns {boolean} true when it completes a double tap
     */
    tap(point) {
      const double =
        last !== null &&
        (point.time ?? 0) - (last.time ?? 0) <= DOUBLE_TAP_TIME &&
        distance(last, point) <= DOUBLE_TAP_DISTANCE;
      last = double ? null : point;
      return double;
    },
    /** Forgets the last tap. */
    reset() {
      last = null;
    },
  };
}

/**
 * The command of a key press, or null. Presses with Ctrl, Meta or Alt are left to the browser.
 * @param {{key: string, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean}} event
 * @returns {string|null} pan-left, pan-right, pan-up, pan-down, zoom-in, zoom-out, reset, julia, back or escape
 */
export function keyCommand({ key, ctrlKey = false, metaKey = false, altKey = false }) {
  if (ctrlKey || metaKey || altKey) return null;
  return Object.hasOwn(KEY_COMMANDS, key) ? KEY_COMMANDS[key] : null;
}

/**
 * Pixels an arrow command drags the picture; arrow right shows more of the right side.
 * @param {string} command
 * @param {number} width
 * @param {number} height
 * @returns {{dx: number, dy: number}|null} null for commands that do not pan
 */
export function panOffset(command, width, height) {
  const step = PAN_FRACTION * Math.min(width, height);
  const offsets = {
    'pan-left': { dx: step, dy: 0 },
    'pan-right': { dx: -step, dy: 0 },
    'pan-up': { dx: 0, dy: step },
    'pan-down': { dx: 0, dy: -step },
  };
  return offsets[command] ?? null;
}
