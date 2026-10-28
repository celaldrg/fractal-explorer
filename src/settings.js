/**
 * Explorer settings: defaults, validation of untrusted input (stored
 * preferences, share links) and the URL hash format used for share links.
 */

import { getFractalType, clampIterations } from './fractals.js';
import { getPalette, DEFAULT_PALETTE_ID } from './palettes.js';
import { clampDensity, wrapOffset } from './color.js';
import { normalizeView } from './view.js';

/** Ways to map escape values to palette positions. */
export const COLORING_MODES = ['smooth', 'histogram'];

/** Julia constants are kept inside [-C_LIMIT, C_LIMIT] on both axes. */
export const C_LIMIT = 4;

/**
 * @typedef {Object} Settings
 * @property {string} type fractal type id
 * @property {import('./view.js').View} view
 * @property {{re: number, im: number}} juliaC constant of the Julia set
 * @property {string} paletteId
 * @property {number} density
 * @property {number} offset
 * @property {'smooth'|'histogram'} coloring
 * @property {'auto'|number} iterations 'auto' or a manual iteration limit
 */

/**
 * Settings of a first visit: the whole Mandelbrot set.
 * @returns {Settings}
 */
export function defaultSettings() {
  const type = /** @type {import('./fractals.js').FractalType} */ (getFractalType('mandelbrot'));
  return {
    type: type.id,
    view: { ...type.home },
    juliaC: { re: -0.8, im: 0.156 },
    paletteId: DEFAULT_PALETTE_ID,
    density: 1,
    offset: 0,
    coloring: 'smooth',
    iterations: 'auto',
  };
}

/**
 * Validates an untrusted Julia constant.
 * @param {unknown} c
 * @returns {{re: number, im: number}|null}
 */
export function normalizeJuliaC(c) {
  if (!c || typeof c !== 'object') return null;
  const { re, im } = /** @type {{re: number, im: number}} */ (c);
  if (!Number.isFinite(re) || !Number.isFinite(im)) return null;
  const clampPart = (value) => Math.min(C_LIMIT, Math.max(-C_LIMIT, value));
  return { re: clampPart(re), im: clampPart(im) };
}

/**
 * Keeps the valid fields of an untrusted settings object, clamped to their ranges.
 * @param {unknown} raw
 * @returns {Partial<Settings>}
 */
export function sanitizeSettings(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const input = /** @type {Record<string, any>} */ (raw);
  /** @type {Partial<Settings>} */
  const out = {};
  if (getFractalType(input.type)) out.type = input.type;
  const view = normalizeView(input.view);
  if (view) out.view = view;
  const juliaC = normalizeJuliaC(input.juliaC);
  if (juliaC) out.juliaC = juliaC;
  if (getPalette(input.paletteId)) out.paletteId = input.paletteId;
  if (Number.isFinite(input.density)) out.density = clampDensity(input.density);
  if (Number.isFinite(input.offset)) out.offset = wrapOffset(input.offset);
  if (COLORING_MODES.includes(input.coloring)) out.coloring = input.coloring;
  if (input.iterations === 'auto') out.iterations = 'auto';
  else if (Number.isFinite(input.iterations)) out.iterations = clampIterations(input.iterations);
  return out;
}

/**
 * Encodes settings as a URL hash, e.g. '#t=mandelbrot&x=-0.75&y=0&s=2.8&p=aurora&...'.
 * Numbers use the shortest text that reads back to the same double.
 * @param {Settings} settings
 * @returns {string}
 */
export function encodeHash(settings) {
  const params = new URLSearchParams();
  params.set('t', settings.type);
  params.set('x', String(settings.view.cx));
  params.set('y', String(settings.view.cy));
  params.set('s', String(settings.view.scale));
  if (settings.type === 'julia') {
    params.set('cr', String(settings.juliaC.re));
    params.set('ci', String(settings.juliaC.im));
  }
  params.set('p', settings.paletteId);
  params.set('d', String(settings.density));
  params.set('o', String(settings.offset));
  params.set('m', settings.coloring);
  params.set('i', String(settings.iterations));
  return `#${params.toString()}`;
}

/**
 * Decodes a URL hash written by encodeHash. Invalid or missing fields are left out.
 * @param {string} hash with or without the leading '#'
 * @returns {Partial<Settings>}
 */
export function decodeHash(hash) {
  const params = new URLSearchParams(String(hash ?? '').replace(/^#/, ''));
  const number = (key) => {
    const text = params.get(key);
    return text === null || text.trim() === '' ? Number.NaN : Number(text);
  };
  const iterations = params.get('i');
  return sanitizeSettings({
    type: params.get('t'),
    view: { cx: number('x'), cy: number('y'), scale: number('s') },
    juliaC: { re: number('cr'), im: number('ci') },
    paletteId: params.get('p'),
    density: number('d'),
    offset: number('o'),
    coloring: params.get('m'),
    iterations: iterations === 'auto' ? 'auto' : number('i'),
  });
}
