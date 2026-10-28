/**
 * Draws the fractal on the main canvas. It sizes the backing store, shows the
 * last frame moved and scaled the moment the view changes, runs the
 * progressive tile passes on the worker pool, and recolours computed pixels
 * without computing them again.
 */

import { computeImage } from './render.js';
import { planRender, createRenderQueue, readTiles } from './tiles.js';
import { buildCdf } from './color.js';
import { frameTransform } from './view.js';
import { createWorkerPool } from './worker-pool.js';
import { coloringOf, paintImage } from './paint.js';

const BACKDROP = '#0f172a';

/** Beyond this magnification the moved old frame is too coarse to be worth drawing. */
const MAX_SHIFT_SCALE = 64;

/**
 * @typedef {import('./explorer.js').ExplorerState} State
 * @typedef {import('./tiles.js').TileJob} TileJob
 * @typedef {import('./view.js').View} View
 * @typedef {Object} Frame a render in progress or done
 * @property {State} state
 * @property {number} started performance.now() when it began
 * @property {boolean} covered every pixel holds a value (the first pass is done)
 * @property {TileJob[]} computed tiles that arrived before the image was covered
 * @property {Float64Array|null} cdf distribution of the values, for histogram colouring;
 *   before the image is covered, only of the computed tiles
 * @property {boolean} done
 */

/**
 * What the picture shows apart from the view; frames of another picture cannot be reused.
 * @param {State} state
 * @returns {string}
 */
function pictureId(state) {
  return state.type === 'julia' ? `julia|${state.juliaC.re}|${state.juliaC.im}` : state.type;
}

/**
 * @param {View} a
 * @param {View} b
 * @returns {boolean}
 */
function sameView(a, b) {
  return a.cx === b.cx && a.cy === b.cy && a.scale === b.scale;
}

/**
 * Creates the renderer of the main canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {{onProgress(fraction: number): void, onComplete(ms: number): void}} hooks
 */
export function createRenderer(canvas, hooks) {
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d', { alpha: false }));
  const snapshot = document.createElement('canvas');
  const snapshotCtx = /** @type {CanvasRenderingContext2D} */ (snapshot.getContext('2d', { alpha: false }));
  const pool = createWorkerPool();
  let width = 0;
  let height = 0;
  let values = new Float32Array(0);
  /** @type {ImageData|null} */
  let image = null;
  /** @type {{view: View, id: string}|null} what the canvas shows */
  let shown = null;
  /** @type {Frame|null} */
  let frame = null;
  /** @type {Array<() => void>} */
  const waiting = [];

  function clear() {
    ctx.fillStyle = BACKDROP;
    ctx.fillRect(0, 0, width, height);
  }

  function takeSnapshot() {
    snapshot.width = width;
    snapshot.height = height;
    snapshotCtx.drawImage(canvas, 0, 0);
  }

  /**
   * Draws the snapshot, taken at `fromView` and size, where it belongs in `toView`.
   * @param {View} fromView
   * @param {number} fromWidth
   * @param {number} fromHeight
   * @param {View} toView
   */
  function drawShifted(fromView, fromWidth, fromHeight, toView) {
    const { x, y, scale } = frameTransform(fromView, fromWidth, fromHeight, toView, width, height);
    clear();
    if (scale > MAX_SHIFT_SCALE || scale < 1 / MAX_SHIFT_SCALE) return;
    ctx.drawImage(snapshot, x, y, fromWidth * scale, fromHeight * scale);
  }

  /**
   * Keeps the old frame on screen, moved to the new view, while the new one renders.
   * @param {State} state
   */
  function showMoved(state) {
    const id = pictureId(state);
    if (shown && shown.id === id) {
      if (!sameView(shown.view, state.view)) {
        takeSnapshot();
        drawShifted(shown.view, width, height, state.view);
      }
    } else {
      clear();
    }
    shown = { view: { ...state.view }, id };
  }

  /**
   * @param {TileJob} tile
   * @param {Float32Array} tileValues
   */
  function storeTile(tile, tileValues) {
    for (let row = 0; row < tile.h; row++) {
      values.set(tileValues.subarray(row * tile.w, (row + 1) * tile.w), (tile.y + row) * width + tile.x);
    }
  }

  /**
   * Distribution of the tiles computed so far: histogram colouring uses it
   * until the first pass covers the image. Null while no tile has arrived.
   * @param {Frame} current
   * @returns {Float64Array|null}
   */
  function partialCdf(current) {
    if (current.computed.length === 0) return null;
    return buildCdf(readTiles(values, width, current.computed), current.state.maxIter);
  }

  /**
   * @param {Frame} current
   * @param {TileJob} tile
   * @param {Float32Array} tileValues
   */
  function paintTile(current, tile, tileValues) {
    const coloring = coloringOf(current.state, current.cdf);
    paintImage(ctx, ctx.createImageData(tile.w, tile.h), tileValues, coloring, tile.x, tile.y);
  }

  /** @param {Frame} current */
  function paintAll(current) {
    paintImage(ctx, /** @type {ImageData} */ (image), values, coloringOf(current.state, current.cdf));
  }

  /**
   * The first pass has reached every pixel: histogram colouring can start.
   * @param {Frame} current
   */
  function cover(current) {
    current.covered = true;
    current.computed = [];
    current.cdf = current.state.coloring === 'histogram' ? buildCdf(values, current.state.maxIter) : null;
    if (current.cdf) paintAll(current);
  }

  /**
   * @param {Frame} current
   * @param {boolean} repaint paint the whole image again
   */
  function finish(current, repaint) {
    if (current.state.coloring === 'histogram') current.cdf = buildCdf(values, current.state.maxIter);
    if (repaint) paintAll(current);
    current.done = true;
    hooks.onComplete(performance.now() - current.started);
    for (const callback of waiting.splice(0)) callback();
  }

  /**
   * @param {Frame} current
   * @param {{progress(): number}} queue
   * @param {TileJob} tile
   * @param {Float32Array} tileValues
   * @param {{passComplete: boolean, finished: boolean}} status
   */
  function onTile(current, queue, tile, tileValues, status) {
    if (current !== frame) return;
    storeTile(tile, tileValues);
    const histogram = current.state.coloring === 'histogram';
    if (current.covered || !histogram || current.cdf) paintTile(current, tile, tileValues);
    if (!current.covered) {
      current.computed.push(tile);
      if (status.passComplete) cover(current);
    }
    if (status.finished) finish(current, histogram);
    else hooks.onProgress(queue.progress());
  }

  return {
    /** @returns {{width: number, height: number}} canvas size in canvas pixels */
    size() {
      return { width, height };
    },

    /**
     * Sizes the backing store; the old picture stays on screen, scaled. After a
     * change the caller must call render() again.
     * @param {number} cssWidth
     * @param {number} cssHeight
     * @param {number} ratio canvas pixels per CSS pixel
     * @returns {boolean} true when the size changed
     */
    resize(cssWidth, cssHeight, ratio) {
      const nextWidth = Math.max(1, Math.round(cssWidth * ratio));
      const nextHeight = Math.max(1, Math.round(cssHeight * ratio));
      if (nextWidth === width && nextHeight === height) return false;
      const [oldWidth, oldHeight] = [width, height];
      if (shown) takeSnapshot();
      canvas.width = nextWidth;
      canvas.height = nextHeight;
      width = nextWidth;
      height = nextHeight;
      values = new Float32Array(width * height);
      image = ctx.createImageData(width, height);
      pool.cancel();
      frame = null;
      if (shown) drawShifted(shown.view, oldWidth, oldHeight, shown.view);
      else clear();
      return true;
    },

    /**
     * Renders a state: progressively on the workers, or at once on this thread
     * when `sync` is true (the ?demo frame).
     * @param {State} state
     * @param {boolean} [sync]
     */
    render(state, sync = false) {
      if (!width || !height) return;
      showMoved(state);
      pool.cancel();
      /** @type {Frame} */
      const current = { state, started: performance.now(), covered: false, computed: [], cdf: null, done: false };
      frame = current;
      if (sync) {
        values = computeImage(state.fractal, state.view, width, height);
        current.covered = true;
        finish(current, true);
        return;
      }
      const queue = createRenderQueue(planRender(width, height));
      hooks.onProgress(0);
      pool.run({ fractal: state.fractal, view: state.view, width, height }, queue, (tile, tileValues, status) =>
        onTile(current, queue, tile, tileValues, status),
      );
    },

    /**
     * Colours the computed pixels again after a palette, density, offset or mode change.
     * @param {State} state
     */
    recolor(state) {
      const current = frame;
      if (!current) return;
      current.state = state;
      const histogram = state.coloring === 'histogram';
      if (!current.covered) {
        current.cdf = histogram ? partialCdf(current) : null;
        for (const tile of current.computed) paintTile(current, tile, readTiles(values, width, [tile]));
        return;
      }
      if (histogram && !current.cdf) current.cdf = buildCdf(values, state.maxIter);
      paintAll(current);
    },

    /**
     * Runs a callback once the picture on screen is complete.
     * @param {() => void} callback
     */
    whenDone(callback) {
      if (frame && !frame.done) waiting.push(callback);
      else callback();
    },
  };
}
