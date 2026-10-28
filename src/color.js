/**
 * Turns escape values into colours: palette sampling, lookup tables, the cyclic
 * smooth mapping (density and offset) and histogram colouring. Pure functions
 * that write into plain typed arrays, so they also run in Node.
 */

/** Entries in a palette lookup table. */
export const LUT_SIZE = 1024;

/** Smallest colour density. */
export const MIN_DENSITY = 0.1;

/** Largest colour density. */
export const MAX_DENSITY = 10;

/** Palette cycles per unit of sqrt(smooth count) at density 1. */
const PHASE_SCALE = 0.25;

/**
 * Parses a '#rrggbb' colour.
 * @param {string} hex
 * @returns {[number, number, number]}
 */
export function parseHex(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Index of the gradient segment that contains u (u in [0, 1)).
 * @param {Array<[number, string]>} stops
 * @param {number} u
 * @returns {number}
 */
function segmentIndex(stops, u) {
  for (let i = stops.length - 1; i >= 0; i--) {
    if (stops[i][0] <= u) return i;
  }
  return stops.length - 1;
}

/**
 * Samples a cyclic palette at position t; period 1, linear interpolation between stops.
 * @param {import('./palettes.js').Palette} palette
 * @param {number} t any real number
 * @returns {[number, number, number]} red, green, blue in [0, 255] (not rounded)
 */
export function samplePalette(palette, t) {
  const { stops } = palette;
  let u = t - Math.floor(t);
  const i = segmentIndex(stops, u);
  const j = (i + 1) % stops.length;
  const start = stops[i][0];
  const end = j > i ? stops[j][0] : stops[j][0] + 1;
  if (u < start) u += 1;
  const f = (u - start) / (end - start);
  const a = parseHex(stops[i][1]);
  const b = parseHex(stops[j][1]);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/**
 * Builds a lookup table of `size` evenly spaced, rounded palette samples (RGB triples).
 * @param {import('./palettes.js').Palette} palette
 * @param {number} [size]
 * @returns {Uint8Array}
 */
export function buildLut(palette, size = LUT_SIZE) {
  const lut = new Uint8Array(size * 3);
  for (let k = 0; k < size; k++) {
    const rgb = samplePalette(palette, k / size);
    lut[k * 3] = Math.round(rgb[0]);
    lut[k * 3 + 1] = Math.round(rgb[1]);
    lut[k * 3 + 2] = Math.round(rgb[2]);
  }
  return lut;
}

const lutCache = new WeakMap();

/**
 * @param {import('./palettes.js').Palette} palette
 * @returns {Uint8Array}
 */
function lutFor(palette) {
  let lut = lutCache.get(palette);
  if (!lut) {
    lut = buildLut(palette);
    lutCache.set(palette, lut);
  }
  return lut;
}

/**
 * Palette position of a smooth count before density and offset are applied.
 * The square root keeps the bands readable as counts grow with the zoom; the
 * position is 0 at a count of 4, about the far background of a home view, where
 * every palette starts dark.
 * @param {number} value smooth iteration count (>= 0)
 * @returns {number}
 */
export function smoothPhase(value) {
  return (Math.sqrt(value) - 2) * PHASE_SCALE;
}

/**
 * Builds the cumulative distribution of escape values for histogram colouring.
 * Entry k is the share of escaped samples whose count is below k.
 * @param {ArrayLike<number>} values escape values (INSIDE entries are ignored)
 * @param {number} maxIter iteration limit used to compute them
 * @returns {Float64Array} maxIter + 2 entries, rising from 0 to 1
 */
export function buildCdf(values, maxIter) {
  const bins = Math.max(1, Math.floor(maxIter) + 1);
  const counts = new Float64Array(bins);
  let total = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v >= 0) {
      counts[Math.min(bins - 1, Math.floor(v))]++;
      total++;
    }
  }
  const cdf = new Float64Array(bins + 1);
  let running = 0;
  for (let k = 0; k < bins; k++) {
    running += counts[k];
    cdf[k + 1] = total ? running / total : 0;
  }
  return cdf;
}

/**
 * Reads a cumulative distribution at a smooth value, interpolating inside a bin.
 * @param {Float64Array} cdf result of buildCdf
 * @param {number} value
 * @returns {number} in [0, 1]
 */
export function cdfAt(cdf, value) {
  const last = cdf.length - 2;
  const bin = Math.min(last, Math.max(0, Math.floor(value)));
  const fraction = Math.min(1, Math.max(0, value - bin));
  return cdf[bin] + (cdf[bin + 1] - cdf[bin]) * fraction;
}

/**
 * @typedef {Object} Coloring
 * @property {import('./palettes.js').Palette} palette
 * @property {number} [density] palette cycles multiplier (default 1)
 * @property {number} [offset] palette shift, one full cycle = 1 (default 0)
 * @property {'smooth'|'histogram'} [mode] mapping of counts to palette positions
 * @property {Float64Array|null} [cdf] distribution for histogram mode (buildCdf)
 */

/**
 * Colours escape values into an RGBA byte buffer (4 bytes per value, alpha 255).
 * Smooth mode: t = density * smoothPhase(v) + offset. Histogram mode:
 * t = density * cdf(v) + offset. The palette repeats with period 1 in t.
 * @param {ArrayLike<number>} values
 * @param {Uint8ClampedArray|Uint8Array} rgba destination, values.length * 4 bytes
 * @param {Coloring} coloring
 */
export function colorize(values, rgba, coloring) {
  const { palette, density = 1, offset = 0, mode = 'smooth', cdf = null } = coloring;
  const lut = lutFor(palette);
  const size = lut.length / 3;
  const [insideR, insideG, insideB] = parseHex(palette.inside);
  const histogram = mode === 'histogram' && cdf !== null;
  for (let i = 0, j = 0; i < values.length; i++, j += 4) {
    const v = values[i];
    if (v < 0) {
      rgba[j] = insideR;
      rgba[j + 1] = insideG;
      rgba[j + 2] = insideB;
    } else {
      let t = (histogram ? cdfAt(cdf, v) : smoothPhase(v)) * density + offset;
      t -= Math.floor(t);
      const k = Math.min(size - 1, Math.floor(t * size)) * 3;
      rgba[j] = lut[k];
      rgba[j + 1] = lut[k + 1];
      rgba[j + 2] = lut[k + 2];
    }
    rgba[j + 3] = 255;
  }
}

/**
 * Clamps a density to [MIN_DENSITY, MAX_DENSITY].
 * @param {number} density
 * @returns {number}
 */
export function clampDensity(density) {
  return Math.min(MAX_DENSITY, Math.max(MIN_DENSITY, density));
}

/**
 * Wraps an offset into [0, 1).
 * @param {number} offset
 * @returns {number}
 */
export function wrapOffset(offset) {
  return offset - Math.floor(offset);
}
