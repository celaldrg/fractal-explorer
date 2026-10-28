import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  INSIDE,
  ESCAPE_RADIUS,
  FRACTAL_TYPES,
  MIN_ITERATIONS,
  MAX_ITERATIONS,
  getFractalType,
  createKernel,
  inMainCardioid,
  inPeriod2Bulb,
  autoMaxIter,
  clampIterations,
  resolveMaxIter,
} from '../src/fractals.js';
import { pixelToComplex } from '../src/view.js';

// Textbook reference: plain complex arithmetic, no shortcuts, no periodicity check.
const add = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
const mul = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const conj = (a) => ({ re: a.re, im: -a.im });
const foldAbs = (a) => ({ re: Math.abs(a.re), im: Math.abs(a.im) });
const power = (z, d) => {
  let p = z;
  for (let k = 1; k < d; k++) p = mul(p, z);
  return p;
};

const STEPS = {
  mandelbrot: (z, c) => add(mul(z, z), c),
  'burning-ship': (z, c) => add(mul(foldAbs(z), foldAbs(z)), conj(c)),
  tricorn: (z, c) => add(mul(conj(z), conj(z)), c),
};

/**
 * Smooth count from the naive loop: mu = n + 1 - log(log|z_n| / log R) / log d.
 */
function reference(step, z0, c, maxIter, { bailout = ESCAPE_RADIUS, degree = 2 } = {}) {
  let z = z0;
  for (let n = 1; n <= maxIter; n++) {
    z = step(z, c);
    if (z.re * z.re + z.im * z.im > bailout * bailout) {
      const mu = n + 1 - Math.log(Math.log(Math.hypot(z.re, z.im)) / Math.log(bailout)) / Math.log(degree);
      return Math.max(0, mu);
    }
  }
  return INSIDE;
}

const ORIGIN = { re: 0, im: 0 };
const naiveMandelbrot = (re, im, maxIter, options) =>
  reference(STEPS.mandelbrot, ORIGIN, { re, im }, maxIter, options);

/**
 * Compares a kernel with a reference on every pixel of a size x size view.
 * @returns {{inside: number, outside: number}} pixel counts, to show both kinds were checked
 */
function compareOnGrid(kernel, referenceAt, view, size = 64) {
  let inside = 0;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const { re, im } = pixelToComplex(view, size, size, px + 0.5, py + 0.5);
      const fast = kernel(re, im);
      const slow = referenceAt(re, im);
      assert.equal(fast === INSIDE, slow === INSIDE, `inside/outside differs at pixel ${px},${py}`);
      if (slow === INSIDE) inside++;
      else assert.ok(Math.abs(fast - slow) < 1e-9, `value differs at pixel ${px},${py}: ${fast} vs ${slow}`);
    }
  }
  return { inside, outside: size * size - inside };
}

test('Mandelbrot: 0, -1, i and -2 stay bounded', () => {
  const kernel = createKernel({ type: 'mandelbrot', maxIter: 1000 });
  const classic = createKernel({ type: 'mandelbrot', maxIter: 1000, bailout: 2 });
  for (const [re, im] of [[0, 0], [-1, 0], [0, 1], [-2, 0]]) {
    assert.equal(kernel(re, im), INSIDE, `${re} + ${im}i`);
    assert.equal(classic(re, im), INSIDE, `${re} + ${im}i with escape radius 2`);
    assert.equal(naiveMandelbrot(re, im, 1000, { bailout: 2 }), INSIDE, `${re} + ${im}i, naive loop`);
  }
});

test('Mandelbrot: 1 and -2.01 escape, 1 within 3 iterations', () => {
  const kernel = createKernel({ type: 'mandelbrot', maxIter: 1000 });
  assert.notEqual(kernel(1, 0), INSIDE);
  assert.notEqual(kernel(-2.01, 0), INSIDE);
  const classic = (maxIter) => createKernel({ type: 'mandelbrot', maxIter, bailout: 2 });
  // z1 = 1, z2 = 2, z3 = 5: |z3| is the first value beyond the radius 2.
  assert.notEqual(classic(3)(1, 0), INSIDE);
  assert.equal(classic(2)(1, 0), INSIDE);
  // z1 = -2.01 is already beyond the radius.
  assert.notEqual(classic(1)(-2.01, 0), INSIDE);
});

test('cardioid and bulb checks accept 0, -0.5, 0.2 and -1 and reject 0.5 and -1.3', () => {
  const accepted = (re) => inMainCardioid(re, 0) || inPeriod2Bulb(re, 0);
  for (const re of [0, -0.5, 0.2, -1]) assert.ok(accepted(re), `${re} should be accepted`);
  for (const re of [0.5, -1.3]) assert.ok(!accepted(re), `${re} should be rejected`);
  assert.ok(inMainCardioid(0, 0) && inMainCardioid(-0.5, 0) && inMainCardioid(0.2, 0));
  assert.ok(inPeriod2Bulb(-1, 0) && !inMainCardioid(-1, 0));
  assert.ok(inMainCardioid(-0.1, 0.5) && !inMainCardioid(0.3, 0.6));
});

test('points accepted by the checks never escape, and -1.3 is caught by periodicity', () => {
  for (const [re, im] of [[0, 0], [-0.5, 0], [0.2, 0], [-1, 0], [-0.1, 0.5], [-1.1, 0.1]]) {
    assert.ok(inMainCardioid(re, im) || inPeriod2Bulb(re, im));
    assert.equal(naiveMandelbrot(re, im, 2000), INSIDE);
  }
  // -1.3 lies in the period-4 bulb: outside both shortcuts but still bounded.
  assert.equal(createKernel({ type: 'mandelbrot', maxIter: 5000 })(-1.3, 0), INSIDE);
  assert.equal(naiveMandelbrot(-1.3, 0, 5000), INSIDE);
});

test('smooth count matches the reference formula for 5 escaping points', () => {
  const kernel = createKernel({ type: 'mandelbrot', maxIter: 1000 });
  for (const [re, im] of [[0.26, 0], [-0.75, 0.1], [0.4, 0.3], [-1.9, 0.1], [-0.1, 1.1]]) {
    const expected = naiveMandelbrot(re, im, 1000);
    assert.notEqual(expected, INSIDE, `${re} + ${im}i should escape`);
    assert.ok(Math.abs(kernel(re, im) - expected) < 1e-9, `${re} + ${im}i`);
  }
});

test('smooth count is continuous across iteration bands', () => {
  const kernel = createKernel({ type: 'mandelbrot', maxIter: 1000 });
  let previous = kernel(0.3, 0);
  for (let re = 0.3; re <= 0.4; re += 1e-4) {
    const value = kernel(re, 0);
    assert.ok(Math.abs(value - previous) < 0.1, `jump at ${re}`);
    previous = value;
  }
});

test('Julia set of c = 0 is the unit circle', () => {
  const kernel = createKernel({ type: 'julia', maxIter: 500, cRe: 0, cIm: 0 });
  for (let k = 0; k < 16; k++) {
    const angle = (2 * Math.PI * k) / 16;
    const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
    assert.equal(kernel(0.99 * cos, 0.99 * sin), INSIDE, `|z| = 0.99 at angle ${k}`);
    assert.notEqual(kernel(1.01 * cos, 1.01 * sin), INSIDE, `|z| = 1.01 at angle ${k}`);
  }
});

test('Burning Ship agrees pixel for pixel with a naive loop on a 64x64 view', () => {
  const maxIter = 300;
  const kernel = createKernel({ type: 'burning-ship', maxIter });
  const naive = (re, im) => reference(STEPS['burning-ship'], ORIGIN, { re, im }, maxIter);
  for (const view of [getFractalType('burning-ship').home, { cx: -1.7605, cy: 0.028, scale: 0.11 }]) {
    const { inside, outside } = compareOnGrid(kernel, naive, view);
    assert.ok(inside > 0 && outside > 0);
  }
});

test('Tricorn agrees pixel for pixel with a naive loop on a 64x64 view', () => {
  const maxIter = 300;
  const kernel = createKernel({ type: 'tricorn', maxIter });
  const naive = (re, im) => reference(STEPS.tricorn, ORIGIN, { re, im }, maxIter);
  const { inside, outside } = compareOnGrid(kernel, naive, getFractalType('tricorn').home);
  assert.ok(inside > 0 && outside > 0);
});

test('Mandelbrot shortcuts change no pixel of the whole set', () => {
  const maxIter = 300;
  const kernel = createKernel({ type: 'mandelbrot', maxIter });
  const naive = (re, im) => naiveMandelbrot(re, im, maxIter);
  const { inside, outside } = compareOnGrid(kernel, naive, getFractalType('mandelbrot').home);
  assert.ok(inside > 0 && outside > 0);
});

test('Julia kernel agrees with a naive loop', () => {
  const maxIter = 300;
  const c = { re: -0.8, im: 0.156 };
  const kernel = createKernel({ type: 'julia', maxIter, cRe: c.re, cIm: c.im });
  const naive = (re, im) => reference(STEPS.mandelbrot, { re, im }, c, maxIter);
  const { inside, outside } = compareOnGrid(kernel, naive, getFractalType('julia').home, 48);
  assert.ok(inside > 0 && outside > 0);
});

test('Multibrot z^d + c agrees with a naive loop for d = 3 to 6', () => {
  const maxIter = 200;
  for (const degree of [3, 4, 5, 6]) {
    const type = getFractalType(`multibrot-${degree}`);
    assert.equal(type.power, degree);
    const kernel = createKernel({ type: type.id, maxIter });
    const step = (z, c) => add(power(z, degree), c);
    const naive = (re, im) => reference(step, ORIGIN, { re, im }, maxIter, { degree });
    const { inside, outside } = compareOnGrid(kernel, naive, type.home, 40);
    assert.ok(inside > 0 && outside > 0, `degree ${degree}`);
  }
});

test('fractal types: all eight are registered and unknown ids are rejected', () => {
  const ids = FRACTAL_TYPES.map((type) => type.id);
  for (const id of ['mandelbrot', 'julia', 'burning-ship', 'tricorn', 'multibrot-3', 'multibrot-4', 'multibrot-5', 'multibrot-6']) {
    assert.ok(ids.includes(id), id);
  }
  assert.equal(new Set(ids).size, ids.length);
  for (const type of FRACTAL_TYPES) {
    assert.ok(type.label.en && type.label.tr, type.id);
    assert.ok(type.home.scale > 0 && Number.isFinite(type.home.cx) && Number.isFinite(type.home.cy));
  }
  assert.equal(getFractalType('nope'), null);
  assert.throws(() => createKernel({ type: 'nope', maxIter: 10 }), /Unknown fractal type/);
});

test('iteration limit grows with the zoom; manual values are clamped', () => {
  const zooms = [0.5, 1, 10, 1e3, 1e6, 1e9, 1e13];
  const limits = zooms.map(autoMaxIter);
  for (let i = 1; i < limits.length; i++) assert.ok(limits[i] >= limits[i - 1]);
  assert.ok(limits.at(-1) > limits[1] * 10);
  assert.equal(autoMaxIter(1), 200);
  assert.equal(autoMaxIter(Number.NaN), 200);
  assert.ok(autoMaxIter(1e300) <= 20000);
  assert.equal(resolveMaxIter('auto', 1e6), autoMaxIter(1e6));
  assert.equal(resolveMaxIter(750, 1e6), 750);
  assert.equal(resolveMaxIter(750, 1), 750);
  assert.equal(clampIterations(3), MIN_ITERATIONS);
  assert.equal(clampIterations(1e9), MAX_ITERATIONS);
  assert.equal(clampIterations(512.4), 512);
});
