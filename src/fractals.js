/**
 * Escape-time fractal engine. Pure math shared by the render workers, the main
 * thread (small synchronous previews) and the tests: no DOM, no globals.
 */

/** Value reported for points that never escaped; they get the inside colour. */
export const INSIDE = -1;

/** Default escape radius. A large radius keeps the smooth count continuous. */
export const ESCAPE_RADIUS = 256;

/** Default periodicity tolerance: an orbit that comes back this close to a saved point is periodic. */
export const PERIOD_TOLERANCE = 1e-12;

/** Smallest iteration limit accepted as a manual setting. */
export const MIN_ITERATIONS = 16;

/** Largest iteration limit accepted as a manual setting. */
export const MAX_ITERATIONS = 50000;

const AUTO_BASE = 200;
const AUTO_GROWTH = 1.25;
const AUTO_CAP = 20000;

/**
 * @typedef {Object} FractalType
 * @property {string} id stable id used in links and settings
 * @property {'mandelbrot'|'julia'|'burning-ship'|'tricorn'|'multibrot'} formula iteration rule
 * @property {number} power degree of the iteration
 * @property {{cx: number, cy: number, scale: number}} home view shown after a reset
 * @property {{en: string, tr: string}} label display name
 */

/**
 * @param {number} power
 * @param {string} superscript
 * @returns {FractalType}
 */
function multibrotType(power, superscript) {
  const name = `Multibrot z${superscript} + c`;
  return {
    id: `multibrot-${power}`,
    formula: 'multibrot',
    power,
    home: { cx: 0, cy: 0, scale: 3 },
    label: { en: name, tr: name },
  };
}

/** Every fractal the explorer can draw, in menu order. @type {FractalType[]} */
export const FRACTAL_TYPES = [
  {
    id: 'mandelbrot',
    formula: 'mandelbrot',
    power: 2,
    home: { cx: -0.75, cy: 0, scale: 2.8 },
    label: { en: 'Mandelbrot', tr: 'Mandelbrot' },
  },
  {
    id: 'julia',
    formula: 'julia',
    power: 2,
    home: { cx: 0, cy: 0, scale: 3.6 },
    label: { en: 'Julia', tr: 'Julia' },
  },
  {
    id: 'burning-ship',
    formula: 'burning-ship',
    power: 2,
    home: { cx: -0.4, cy: 0.5, scale: 3.4 },
    label: { en: 'Burning Ship', tr: 'Yanan Gemi' },
  },
  {
    id: 'tricorn',
    formula: 'tricorn',
    power: 2,
    home: { cx: -0.3, cy: 0, scale: 3.6 },
    label: { en: 'Tricorn', tr: 'Üç Köşe' },
  },
  multibrotType(3, '³'),
  multibrotType(4, '⁴'),
  multibrotType(5, '⁵'),
  multibrotType(6, '⁶'),
];

/**
 * Looks up a fractal type by id.
 * @param {string} id
 * @returns {FractalType|null}
 */
export function getFractalType(id) {
  return FRACTAL_TYPES.find((type) => type.id === id) ?? null;
}

/**
 * True when c = x + iy lies in the main cardioid of the Mandelbrot set.
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function inMainCardioid(x, y) {
  const xs = x - 0.25;
  const q = xs * xs + y * y;
  return q * (q + xs) <= 0.25 * y * y;
}

/**
 * True when c = x + iy lies in the period-2 bulb (the disc of radius 1/4 around -1).
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function inPeriod2Bulb(x, y) {
  const xs = x + 1;
  return xs * xs + y * y <= 0.0625;
}

/**
 * Normalised iteration count of a point that escaped at iteration n.
 * @param {number} n
 * @param {number} r2 |z_n|^2
 * @param {number} logBailout
 * @param {number} logPower
 * @returns {number}
 */
function smoothCount(n, r2, logBailout, logPower) {
  const mu = n + 1 - Math.log((0.5 * Math.log(r2)) / logBailout) / logPower;
  return mu > 0 ? mu : 0;
}

/**
 * @typedef {Object} KernelConfig
 * @property {number} maxIter
 * @property {number} bailout2
 * @property {number} logBailout
 * @property {number} logPower
 * @property {number} tol2
 * @property {number} power
 * @property {number} cRe
 * @property {number} cIm
 */

// The kernels below share one loop shape: apply the map, test the escape
// radius, then compare the orbit with a point saved at doubling intervals
// (Brent's cycle detection), which ends bounded periodic orbits early.

/** @param {KernelConfig} k */
function mandelbrotKernel({ maxIter, bailout2, logBailout, logPower, tol2 }) {
  return (cx, cy) => {
    if (inMainCardioid(cx, cy) || inPeriod2Bulb(cx, cy)) return INSIDE;
    let x = 0;
    let y = 0;
    let xx = 0;
    let yy = 0;
    let savedX = 0;
    let savedY = 0;
    let steps = 0;
    let span = 1;
    for (let n = 1; n <= maxIter; n++) {
      y = 2 * x * y + cy;
      x = xx - yy + cx;
      xx = x * x;
      yy = y * y;
      if (xx + yy > bailout2) return smoothCount(n, xx + yy, logBailout, logPower);
      const dx = x - savedX;
      const dy = y - savedY;
      if (dx * dx + dy * dy < tol2) return INSIDE;
      if (++steps === span) {
        savedX = x;
        savedY = y;
        steps = 0;
        span *= 2;
      }
    }
    return INSIDE;
  };
}

/** @param {KernelConfig} k */
function juliaKernel({ maxIter, bailout2, logBailout, logPower, tol2, cRe, cIm }) {
  return (zx, zy) => {
    let x = zx;
    let y = zy;
    let xx = x * x;
    let yy = y * y;
    let savedX = x;
    let savedY = y;
    let steps = 0;
    let span = 1;
    for (let n = 1; n <= maxIter; n++) {
      y = 2 * x * y + cIm;
      x = xx - yy + cRe;
      xx = x * x;
      yy = y * y;
      if (xx + yy > bailout2) return smoothCount(n, xx + yy, logBailout, logPower);
      const dx = x - savedX;
      const dy = y - savedY;
      if (dx * dx + dy * dy < tol2) return INSIDE;
      if (++steps === span) {
        savedX = x;
        savedY = y;
        steps = 0;
        span *= 2;
      }
    }
    return INSIDE;
  };
}

/**
 * Burning Ship: z <- (|Re z| + i|Im z|)^2 + conj(c). Using the conjugate of the
 * point mirrors the classic picture so the ship stands upright on screen.
 * @param {KernelConfig} k
 */
function burningShipKernel({ maxIter, bailout2, logBailout, logPower, tol2 }) {
  return (cx, cy) => {
    let x = 0;
    let y = 0;
    let xx = 0;
    let yy = 0;
    let savedX = 0;
    let savedY = 0;
    let steps = 0;
    let span = 1;
    for (let n = 1; n <= maxIter; n++) {
      y = 2 * Math.abs(x * y) - cy;
      x = xx - yy + cx;
      xx = x * x;
      yy = y * y;
      if (xx + yy > bailout2) return smoothCount(n, xx + yy, logBailout, logPower);
      const dx = x - savedX;
      const dy = y - savedY;
      if (dx * dx + dy * dy < tol2) return INSIDE;
      if (++steps === span) {
        savedX = x;
        savedY = y;
        steps = 0;
        span *= 2;
      }
    }
    return INSIDE;
  };
}

/**
 * Tricorn (Mandelbar): z <- conj(z)^2 + c.
 * @param {KernelConfig} k
 */
function tricornKernel({ maxIter, bailout2, logBailout, logPower, tol2 }) {
  return (cx, cy) => {
    let x = 0;
    let y = 0;
    let xx = 0;
    let yy = 0;
    let savedX = 0;
    let savedY = 0;
    let steps = 0;
    let span = 1;
    for (let n = 1; n <= maxIter; n++) {
      y = -2 * x * y + cy;
      x = xx - yy + cx;
      xx = x * x;
      yy = y * y;
      if (xx + yy > bailout2) return smoothCount(n, xx + yy, logBailout, logPower);
      const dx = x - savedX;
      const dy = y - savedY;
      if (dx * dx + dy * dy < tol2) return INSIDE;
      if (++steps === span) {
        savedX = x;
        savedY = y;
        steps = 0;
        span *= 2;
      }
    }
    return INSIDE;
  };
}

/**
 * Multibrot: z <- z^d + c, with z^d built from repeated complex products.
 * @param {KernelConfig} k
 */
function multibrotKernel({ maxIter, bailout2, logBailout, logPower, tol2, power }) {
  return (cx, cy) => {
    let x = 0;
    let y = 0;
    let savedX = 0;
    let savedY = 0;
    let steps = 0;
    let span = 1;
    for (let n = 1; n <= maxIter; n++) {
      let px = x;
      let py = y;
      for (let k = 1; k < power; k++) {
        const re = px * x - py * y;
        py = px * y + py * x;
        px = re;
      }
      x = px + cx;
      y = py + cy;
      const r2 = x * x + y * y;
      if (r2 > bailout2) return smoothCount(n, r2, logBailout, logPower);
      const dx = x - savedX;
      const dy = y - savedY;
      if (dx * dx + dy * dy < tol2) return INSIDE;
      if (++steps === span) {
        savedX = x;
        savedY = y;
        steps = 0;
        span *= 2;
      }
    }
    return INSIDE;
  };
}

const KERNELS = {
  mandelbrot: mandelbrotKernel,
  julia: juliaKernel,
  'burning-ship': burningShipKernel,
  tricorn: tricornKernel,
  multibrot: multibrotKernel,
};

/**
 * @typedef {Object} FractalParams
 * @property {string} type fractal type id (see FRACTAL_TYPES)
 * @property {number} maxIter iteration limit
 * @property {number} [cRe] Julia constant, real part
 * @property {number} [cIm] Julia constant, imaginary part
 * @property {number} [bailout] escape radius, at least 2 (default ESCAPE_RADIUS)
 * @property {number} [periodTolerance] periodicity tolerance; 0 turns the check off
 */

/**
 * Builds the escape-time function of one fractal. The returned function maps a
 * point x + iy of the plane to its smooth iteration count, or to INSIDE when the
 * orbit stayed bounded for maxIter iterations (or was found to be periodic).
 * A point whose orbit first leaves the escape radius R at iteration n scores
 * mu = n + 1 - log(log|z_n| / log R) / log d (d = power, clamped at 0).
 * @param {FractalParams} params
 * @returns {(x: number, y: number) => number}
 */
export function createKernel(params) {
  const type = getFractalType(params.type);
  if (!type) throw new Error(`Unknown fractal type: ${params.type}`);
  const bailout = Math.max(2, params.bailout ?? ESCAPE_RADIUS);
  const tolerance = params.periodTolerance ?? PERIOD_TOLERANCE;
  return KERNELS[type.formula]({
    maxIter: Math.max(1, Math.floor(params.maxIter)),
    bailout2: bailout * bailout,
    logBailout: Math.log(bailout),
    logPower: Math.log(type.power),
    tol2: tolerance * tolerance,
    power: type.power,
    cRe: params.cRe ?? 0,
    cIm: params.cIm ?? 0,
  });
}

/**
 * Iteration limit for a zoom factor; it grows with the zoom depth so deep views keep their detail.
 * @param {number} zoom zoom factor relative to the fractal's home view (1 = home)
 * @returns {number}
 */
export function autoMaxIter(zoom) {
  const depth = Number.isFinite(zoom) && zoom > 1 ? Math.log10(zoom) : 0;
  return Math.min(AUTO_CAP, Math.round(AUTO_BASE * (1 + depth) ** AUTO_GROWTH));
}

/**
 * Clamps a manual iteration limit to [MIN_ITERATIONS, MAX_ITERATIONS].
 * @param {number} value
 * @returns {number}
 */
export function clampIterations(value) {
  const n = Number.isFinite(value) ? Math.round(value) : AUTO_BASE;
  return Math.min(MAX_ITERATIONS, Math.max(MIN_ITERATIONS, n));
}

/**
 * Resolves an iteration setting to a concrete limit.
 * @param {'auto'|number} setting 'auto' or a manual limit
 * @param {number} zoom current zoom factor
 * @returns {number}
 */
export function resolveMaxIter(setting, zoom) {
  return setting === 'auto' ? autoMaxIter(zoom) : clampIterations(setting);
}
