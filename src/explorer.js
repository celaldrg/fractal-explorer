/**
 * Explorer state machine: what is on screen and how it changes in response to
 * the user. Pure logic that the UI drives; it never touches the DOM.
 */

import { getFractalType, resolveMaxIter, clampIterations } from './fractals.js';
import {
  panView,
  zoomView,
  zoomToRect,
  pixelToComplex,
  zoomFactor,
  isPrecisionLimited,
} from './view.js';
import { getPalette } from './palettes.js';
import { clampDensity, wrapOffset } from './color.js';
import { getPlace } from './places.js';
import {
  COLORING_MODES,
  defaultSettings,
  sanitizeSettings,
  normalizeJuliaC,
  encodeHash,
  decodeHash,
} from './settings.js';

/** Most zoom steps the Back button can undo. */
export const HISTORY_LIMIT = 100;

/** Iteration limit of the Julia picker's mini preview: quick, and plenty at its home view. */
const PREVIEW_MAX_ITER = 200;

const DEMO_OPTIONS = {
  place: 'seahorse-valley',
  paletteId: 'neon',
  density: 1.2,
  offset: 0.7,
  coloring: 'smooth',
  iterations: 'auto',
};

/**
 * @typedef {import('./settings.js').Settings} Settings
 * @typedef {import('./view.js').View} View
 */

/**
 * @typedef {Object} ExplorerState
 * @property {string} type fractal type id
 * @property {View} view
 * @property {{re: number, im: number}} juliaC
 * @property {string} paletteId
 * @property {number} density
 * @property {number} offset
 * @property {'smooth'|'histogram'} coloring
 * @property {'auto'|number} iterations iteration setting
 * @property {number} maxIter iteration limit in use
 * @property {number} zoom zoom factor relative to the type's home view
 * @property {boolean} precisionLimited true once double precision runs out
 * @property {boolean} canGoBack whether back() has something to undo
 * @property {import('./fractals.js').FractalParams} fractal ready for a RenderJob
 * @property {string} renderKey changes whenever the escape values change
 * @property {string} colorKey changes whenever only the colouring changes
 */

/**
 * @param {string} typeId
 * @returns {View}
 */
function homeView(typeId) {
  const type = /** @type {import('./fractals.js').FractalType} */ (getFractalType(typeId));
  return { ...type.home };
}

/**
 * @param {{type: string, view: View, juliaC: {re: number, im: number}}} a
 * @param {{type: string, view: View, juliaC: {re: number, im: number}}} b
 * @returns {boolean}
 */
function samePicture(a, b) {
  return (
    a.type === b.type &&
    a.view.cx === b.view.cx &&
    a.view.cy === b.view.cy &&
    a.view.scale === b.view.scale &&
    a.juliaC.re === b.juliaC.re &&
    a.juliaC.im === b.juliaC.im
  );
}

/**
 * Applies validated settings; a new type without a view of its own gets its home view.
 * @param {Settings} settings
 * @param {Partial<Settings>} changes
 * @returns {Settings}
 */
function withChanges(settings, changes) {
  const next = { ...settings, ...changes };
  if (changes.type && !changes.view) next.view = homeView(changes.type);
  return next;
}

/**
 * Settings after a place has been applied.
 * @param {Settings} settings
 * @param {import('./places.js').Place} place
 * @returns {Settings}
 */
function withPlace(settings, place) {
  return {
    ...settings,
    type: place.type,
    view: { ...place.view },
    juliaC: place.c ? { ...place.c } : settings.juliaC,
  };
}

/**
 * Builds the starting settings: defaults, then valid options, then a place, then a hash.
 * @param {Record<string, any>} options
 * @returns {Settings}
 */
function initialSettings(options) {
  let settings = withChanges(defaultSettings(), sanitizeSettings(options));
  const place = getPlace(options.place);
  if (place) settings = withPlace(settings, place);
  if (typeof options.hash === 'string') settings = withChanges(settings, decodeHash(options.hash));
  return settings;
}

/**
 * Creates an explorer. Options may hold any Settings field (invalid ones are
 * ignored), `place` (a place id) and `hash` (a share-link hash); later sources win.
 * @param {Partial<Settings> & {place?: string, hash?: string}} [options]
 */
export function createExplorer(options = {}) {
  let settings = initialSettings(options);
  /** @type {{type: string, view: View}|null} */
  let juliaReturn = null;
  /** @type {Array<{type: string, view: View, juliaC: {re: number, im: number}}>} */
  const history = [];

  const picture = () => ({ type: settings.type, view: { ...settings.view }, juliaC: { ...settings.juliaC } });

  /** Saves the current picture so that back() can return to it. */
  function record() {
    const entry = picture();
    const last = history[history.length - 1];
    if (last && samePicture(last, entry)) return;
    history.push(entry);
    if (history.length > HISTORY_LIMIT) history.shift();
  }

  /** @param {{re: number, im: number}} c */
  function enterJulia(c) {
    record();
    juliaReturn = { type: settings.type, view: { ...settings.view } };
    settings = { ...settings, type: 'julia', view: homeView('julia'), juliaC: normalizeJuliaC(c) ?? settings.juliaC };
  }

  return {
    /**
     * Snapshot of the current state (a fresh object on every call).
     * @returns {ExplorerState}
     */
    getState() {
      const type = /** @type {import('./fractals.js').FractalType} */ (getFractalType(settings.type));
      const zoom = zoomFactor(settings.view, type.home);
      const maxIter = resolveMaxIter(settings.iterations, zoom);
      const { view, juliaC } = settings;
      const julia = settings.type === 'julia' ? `${juliaC.re},${juliaC.im}` : '';
      return {
        ...settings,
        view: { ...view },
        juliaC: { ...juliaC },
        maxIter,
        zoom,
        precisionLimited: isPrecisionLimited(view),
        canGoBack: history.length > 0,
        fractal: { type: settings.type, maxIter, cRe: juliaC.re, cIm: juliaC.im },
        renderKey: [settings.type, view.cx, view.cy, view.scale, julia, maxIter].join('|'),
        colorKey: [settings.paletteId, settings.density, settings.offset, settings.coloring].join('|'),
      };
    },

    /**
     * Drags the picture by (dx, dy) pixels on a width x height screen.
     * @param {number} dx
     * @param {number} dy
     * @param {number} width
     * @param {number} height
     */
    pan(dx, dy, width, height) {
      settings = { ...settings, view: panView(settings.view, width, height, dx, dy) };
    },

    /**
     * Zooms around the pixel (px, py); factor > 1 zooms in. Pass record = false
     * for the follow-up events of one gesture (wheel bursts, pinches).
     * @param {number} px
     * @param {number} py
     * @param {number} factor
     * @param {number} width
     * @param {number} height
     * @param {boolean} [recordStep]
     */
    zoomAt(px, py, factor, width, height, recordStep = true) {
      if (recordStep) record();
      settings = { ...settings, view: zoomView(settings.view, width, height, px, py, factor) };
    },

    /**
     * Zooms into the box between two pixel corners.
     * @param {number} x0
     * @param {number} y0
     * @param {number} x1
     * @param {number} y1
     * @param {number} width
     * @param {number} height
     */
    zoomBox(x0, y0, x1, y1, width, height) {
      record();
      settings = { ...settings, view: zoomToRect(settings.view, width, height, x0, y0, x1, y1) };
    },

    /**
     * Undoes the last recorded step.
     * @returns {boolean} false when there was nothing to undo
     */
    back() {
      const entry = history.pop();
      if (!entry) return false;
      settings = { ...settings, ...entry };
      return true;
    },

    /** Returns to the home view of the current fractal. */
    reset() {
      record();
      settings = { ...settings, view: homeView(settings.type) };
    },

    /**
     * Switches to another fractal type at its home view.
     * @param {string} typeId
     * @returns {boolean} false for an unknown or unchanged type
     */
    setType(typeId) {
      if (!getFractalType(typeId) || typeId === settings.type) return false;
      record();
      juliaReturn = null;
      settings = { ...settings, type: typeId, view: homeView(typeId) };
      return true;
    },

    /**
     * Julia mode on/off. From the Mandelbrot set it opens the Julia set of the
     * screen centre; from another type it opens the current Julia constant; from
     * a Julia set it goes back to where Julia mode was entered.
     */
    toggleJulia() {
      if (settings.type !== 'julia') {
        const fromMandelbrot = settings.type === 'mandelbrot';
        enterJulia(fromMandelbrot ? { re: settings.view.cx, im: settings.view.cy } : settings.juliaC);
        return;
      }
      record();
      const target = juliaReturn ?? { type: 'mandelbrot', view: homeView('mandelbrot') };
      juliaReturn = null;
      settings = { ...settings, type: target.type, view: { ...target.view } };
    },

    /**
     * Julia picker: uses the point under pixel (px, py) as the constant c and opens its Julia set.
     * @param {number} px
     * @param {number} py
     * @param {number} width
     * @param {number} height
     * @returns {boolean} false while a Julia set is shown (there is no parameter plane to pick from)
     */
    pickJulia(px, py, width, height) {
      if (settings.type === 'julia') return false;
      enterJulia(pixelToComplex(settings.view, width, height, px, py));
      return true;
    },

    /**
     * What the Julia picker's live mini preview shows for the point under pixel
     * (px, py): pass `fractal` and `view` to computeImage at the preview size.
     * @param {number} px
     * @param {number} py
     * @param {number} width
     * @param {number} height
     * @returns {{c: {re: number, im: number}, fractal: import('./fractals.js').FractalParams, view: View}|null}
     *   null while a Julia set is shown
     */
    juliaPreview(px, py, width, height) {
      if (settings.type === 'julia') return null;
      const c = /** @type {{re: number, im: number}} */ (
        normalizeJuliaC(pixelToComplex(settings.view, width, height, px, py))
      );
      return {
        c,
        fractal: { type: 'julia', maxIter: PREVIEW_MAX_ITER, cRe: c.re, cIm: c.im },
        view: homeView('julia'),
      };
    },

    /**
     * Sets the Julia constant directly.
     * @param {number} re
     * @param {number} im
     */
    setJuliaC(re, im) {
      const c = normalizeJuliaC({ re, im });
      if (c) settings = { ...settings, juliaC: c };
    },

    /**
     * Jumps to a famous place.
     * @param {string} placeId
     * @returns {boolean} false for an unknown place
     */
    goToPlace(placeId) {
      const place = getPlace(placeId);
      if (!place) return false;
      record();
      juliaReturn = null;
      settings = withPlace(settings, place);
      return true;
    },

    /** @param {string} paletteId */
    setPalette(paletteId) {
      if (getPalette(paletteId)) settings = { ...settings, paletteId };
    },

    /** @param {number} density */
    setDensity(density) {
      if (Number.isFinite(density)) settings = { ...settings, density: clampDensity(density) };
    },

    /** @param {number} offset */
    setOffset(offset) {
      if (Number.isFinite(offset)) settings = { ...settings, offset: wrapOffset(offset) };
    },

    /** @param {'smooth'|'histogram'} mode */
    setColoring(mode) {
      if (COLORING_MODES.includes(mode)) settings = { ...settings, coloring: mode };
    },

    /** @param {'auto'|number} iterations 'auto' or a manual limit */
    setIterations(iterations) {
      if (iterations === 'auto') settings = { ...settings, iterations };
      else if (Number.isFinite(iterations)) settings = { ...settings, iterations: clampIterations(iterations) };
    },

    /**
     * Share-link hash of the current state.
     * @returns {string}
     */
    toHash() {
      return encodeHash(settings);
    },

    /**
     * Applies a share-link hash (for example after a hashchange event).
     * @param {string} hash
     * @returns {boolean} true when the state changed
     */
    applyHash(hash) {
      const next = withChanges(settings, decodeHash(hash));
      if (encodeHash(next) === encodeHash(settings)) return false;
      record();
      juliaReturn = null;
      settings = next;
      return true;
    },
  };
}

/**
 * The deterministic "?demo" state: Seahorse Valley in a vivid palette.
 * @returns {ReturnType<typeof createExplorer>}
 */
export function createDemoExplorer() {
  return createExplorer(DEMO_OPTIONS);
}
