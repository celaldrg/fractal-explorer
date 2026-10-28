import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createExplorer, createDemoExplorer, HISTORY_LIMIT } from '../src/explorer.js';
import { getFractalType, autoMaxIter, INSIDE } from '../src/fractals.js';
import { getPlace } from '../src/places.js';
import { getPalette } from '../src/palettes.js';
import { pixelToComplex, MIN_SCALE } from '../src/view.js';
import { computeImage } from '../src/render.js';
import { colorize } from '../src/color.js';

const [W, H] = [800, 600];
const home = (typeId) => getFractalType(typeId).home;

test('a new explorer shows the whole Mandelbrot set with automatic iterations', () => {
  const state = createExplorer().getState();
  assert.equal(state.type, 'mandelbrot');
  assert.deepEqual(state.view, home('mandelbrot'));
  assert.equal(state.iterations, 'auto');
  assert.equal(state.zoom, 1);
  assert.equal(state.maxIter, autoMaxIter(1));
  assert.equal(state.canGoBack, false);
  assert.equal(state.precisionLimited, false);
  assert.deepEqual(state.fractal, { type: 'mandelbrot', maxIter: state.maxIter, cRe: -0.8, cIm: 0.156 });
});

test('Back undoes zoom steps in order', () => {
  const explorer = createExplorer();
  const start = explorer.getState().view;
  explorer.zoomAt(100, 100, 2, W, H);
  const once = explorer.getState().view;
  explorer.zoomBox(10, 10, 210, 160, W, H);
  assert.ok(explorer.getState().zoom > 2);
  assert.equal(explorer.getState().canGoBack, true);
  assert.equal(explorer.back(), true);
  assert.deepEqual(explorer.getState().view, once);
  assert.equal(explorer.back(), true);
  assert.deepEqual(explorer.getState().view, start);
  assert.equal(explorer.back(), false);
  assert.equal(explorer.getState().canGoBack, false);
});

test('one gesture is one step, and panning is not a step', () => {
  const explorer = createExplorer();
  const start = explorer.getState().view;
  explorer.zoomAt(400, 300, 1.1, W, H);
  for (let i = 0; i < 9; i++) explorer.zoomAt(400, 300, 1.1, W, H, false);
  explorer.pan(30, -20, W, H);
  assert.ok(explorer.getState().zoom > 2.5);
  explorer.back();
  assert.deepEqual(explorer.getState().view, start);
  assert.equal(explorer.getState().canGoBack, false);
});

test('history keeps the last HISTORY_LIMIT steps and skips repeats', () => {
  const explorer = createExplorer();
  for (let i = 0; i < HISTORY_LIMIT + 20; i++) explorer.zoomAt(400, 300, 1.05, W, H);
  let undone = 0;
  while (explorer.back()) undone++;
  assert.equal(undone, HISTORY_LIMIT);
  assert.ok(explorer.getState().zoom > 2, 'the oldest steps were dropped');

  const still = createExplorer();
  still.reset();
  still.reset();
  assert.equal(still.back(), true);
  assert.equal(still.back(), false, 'two identical pictures make one step');
});

test('reset goes home and can be undone', () => {
  const explorer = createExplorer();
  explorer.zoomAt(123, 45, 8, W, H);
  const deep = explorer.getState().view;
  explorer.reset();
  assert.deepEqual(explorer.getState().view, home('mandelbrot'));
  explorer.back();
  assert.deepEqual(explorer.getState().view, deep);
});

test('switching type opens its home view; unknown or unchanged types do nothing', () => {
  const explorer = createExplorer();
  assert.equal(explorer.setType('burning-ship'), true);
  assert.equal(explorer.getState().type, 'burning-ship');
  assert.deepEqual(explorer.getState().view, home('burning-ship'));
  assert.equal(explorer.setType('burning-ship'), false);
  assert.equal(explorer.setType('nope'), false);
  explorer.back();
  assert.equal(explorer.getState().type, 'mandelbrot');
});

test('J opens the Julia set of the screen centre and J again returns', () => {
  const explorer = createExplorer();
  explorer.zoomAt(200, 150, 4, W, H);
  const before = explorer.getState();
  explorer.toggleJulia();
  const julia = explorer.getState();
  assert.equal(julia.type, 'julia');
  assert.deepEqual(julia.juliaC, { re: before.view.cx, im: before.view.cy });
  assert.deepEqual(julia.view, home('julia'));
  assert.notEqual(julia.renderKey, before.renderKey);
  explorer.zoomAt(400, 300, 2, W, H);
  const zoomedJulia = explorer.getState().view;
  explorer.toggleJulia();
  assert.equal(explorer.getState().type, 'mandelbrot');
  assert.deepEqual(explorer.getState().view, before.view);
  explorer.back();
  assert.deepEqual(explorer.getState().view, zoomedJulia, 'Back walks the same way in reverse');
  assert.equal(explorer.getState().type, 'julia');
});

test('J from another type uses the current constant; J from a shared Julia link goes to the Mandelbrot set', () => {
  const explorer = createExplorer({ type: 'tricorn' });
  explorer.setJuliaC(0.285, 0.01);
  explorer.toggleJulia();
  assert.deepEqual(explorer.getState().juliaC, { re: 0.285, im: 0.01 });
  explorer.toggleJulia();
  assert.equal(explorer.getState().type, 'tricorn');

  const linked = createExplorer({ hash: '#t=julia&cr=0.285&ci=0.01' });
  linked.toggleJulia();
  assert.equal(linked.getState().type, 'mandelbrot');
  assert.deepEqual(linked.getState().view, home('mandelbrot'));
});

test('the Julia picker uses the point under the pointer and previews it first', () => {
  const explorer = createExplorer();
  const view = explorer.getState().view;
  const point = pixelToComplex(view, W, H, 560, 236);
  const preview = explorer.juliaPreview(560, 236, W, H);
  assert.deepEqual(preview.c, point);
  assert.deepEqual(preview.view, home('julia'));
  assert.equal(preview.fractal.type, 'julia');
  assert.deepEqual([preview.fractal.cRe, preview.fractal.cIm], [point.re, point.im]);
  const pixels = computeImage(preview.fractal, preview.view, 40, 30);
  assert.ok(pixels.some((v) => v === INSIDE) && pixels.some((v) => v !== INSIDE));
  assert.equal(explorer.getState().type, 'mandelbrot', 'previewing changes nothing');

  assert.equal(explorer.pickJulia(560, 236, W, H), true);
  assert.deepEqual(explorer.getState().juliaC, point);
  assert.equal(explorer.getState().type, 'julia');
  assert.equal(explorer.pickJulia(1, 1, W, H), false);
  assert.equal(explorer.juliaPreview(1, 1, W, H), null);
  explorer.toggleJulia();
  assert.deepEqual(explorer.getState().view, view);
});

test('Julia constants stay within limits', () => {
  const explorer = createExplorer({ view: { cx: 7, cy: -7, scale: 1 } });
  explorer.toggleJulia();
  assert.deepEqual(explorer.getState().juliaC, { re: 4, im: -4 });
  explorer.setJuliaC(Number.NaN, 0);
  assert.deepEqual(explorer.getState().juliaC, { re: 4, im: -4 });
});

test('famous places set type, view and Julia constant', () => {
  const explorer = createExplorer();
  const rabbit = getPlace('rabbit');
  assert.equal(explorer.goToPlace('rabbit'), true);
  let state = explorer.getState();
  assert.equal(state.type, 'julia');
  assert.deepEqual(state.view, rabbit.view);
  assert.deepEqual(state.juliaC, rabbit.c);
  assert.equal(explorer.goToPlace('spiral'), true);
  state = explorer.getState();
  assert.equal(state.type, 'mandelbrot');
  assert.deepEqual(state.view, getPlace('spiral').view);
  assert.deepEqual(state.juliaC, rabbit.c, 'the last constant is kept');
  assert.equal(explorer.goToPlace('nope'), false);
  explorer.back();
  explorer.back();
  assert.deepEqual(explorer.getState().view, home('mandelbrot'));
  explorer.getState().view.cx = 42;
  assert.equal(getPlace('spiral').view.cx, -0.76155, 'places are never modified');
});

test('colour and iteration settings are validated', () => {
  const explorer = createExplorer();
  explorer.setPalette('ember');
  explorer.setPalette('nope');
  explorer.setDensity(50);
  explorer.setOffset(1.75);
  explorer.setColoring('histogram');
  explorer.setColoring('rainbow');
  explorer.setIterations(3);
  let state = explorer.getState();
  assert.deepEqual(
    [state.paletteId, state.density, state.offset, state.coloring, state.iterations, state.maxIter],
    ['ember', 10, 0.75, 'histogram', 16, 16],
  );
  explorer.setDensity(Number.NaN);
  explorer.setOffset(Number.POSITIVE_INFINITY);
  explorer.setIterations('lots');
  state = explorer.getState();
  assert.deepEqual([state.density, state.offset, state.iterations], [10, 0.75, 16]);
  explorer.zoomAt(400, 300, 1000, W, H);
  explorer.setIterations('auto');
  assert.equal(explorer.getState().maxIter, autoMaxIter(explorer.getState().zoom));
  assert.ok(explorer.getState().maxIter > autoMaxIter(1), 'more iterations deeper down');
});

test('renderKey follows the escape values and colorKey the colouring', () => {
  const explorer = createExplorer();
  const a = explorer.getState();
  explorer.setPalette('lagoon');
  explorer.setOffset(0.3);
  const b = explorer.getState();
  assert.equal(b.renderKey, a.renderKey);
  assert.notEqual(b.colorKey, a.colorKey);
  explorer.setJuliaC(0.3, 0.5);
  assert.equal(explorer.getState().renderKey, a.renderKey, 'c does not matter for the Mandelbrot set');
  explorer.pan(5, 0, W, H);
  const c = explorer.getState();
  assert.notEqual(c.renderKey, a.renderKey);
  assert.equal(c.colorKey, b.colorKey);
  explorer.setIterations(999);
  assert.notEqual(explorer.getState().renderKey, c.renderKey);
});

test('the precision notice turns on once the view is narrower than about 1e-13', () => {
  const explorer = createExplorer();
  explorer.zoomAt(400, 300, 2.8 / 2e-13, W, H);
  assert.equal(explorer.getState().precisionLimited, false);
  explorer.zoomAt(400, 300, 4, W, H);
  assert.equal(explorer.getState().precisionLimited, true);
  explorer.zoomAt(400, 300, 1e6, W, H);
  assert.equal(explorer.getState().view.scale, MIN_SCALE, 'zooming stops at the smallest scale');
});

test('share links restore the same picture and colours', () => {
  const explorer = createExplorer();
  explorer.goToPlace('galaxy');
  explorer.zoomAt(300, 200, 3, W, H);
  explorer.setPalette('dusk');
  explorer.setDensity(2.5);
  explorer.setOffset(0.4);
  explorer.setColoring('histogram');
  explorer.setIterations(1500);
  const hash = explorer.toHash();
  const original = explorer.getState();

  const copy = createExplorer({ hash }).getState();
  for (const key of ['type', 'view', 'juliaC', 'paletteId', 'density', 'offset', 'coloring', 'iterations', 'renderKey', 'colorKey']) {
    assert.deepEqual(copy[key], original[key], key);
  }

  const other = createExplorer();
  assert.equal(other.applyHash(hash), true);
  assert.equal(other.toHash(), hash);
  assert.equal(other.applyHash(hash), false, 'nothing changed');
  assert.equal(other.applyHash('#garbage=1'), false);
  other.back();
  assert.equal(other.getState().type, 'mandelbrot');
  assert.deepEqual(other.getState().view, home('mandelbrot'));
});

test('options are validated and later sources win', () => {
  let state = createExplorer({ type: 'tricorn', paletteId: 'nope', density: 'x', hash: '#p=citrus' }).getState();
  assert.equal(state.type, 'tricorn');
  assert.deepEqual(state.view, home('tricorn'));
  assert.equal(state.paletteId, 'citrus');
  assert.equal(state.density, 1);
  state = createExplorer({ place: 'armada', hash: '#t=multibrot-4' }).getState();
  assert.equal(state.type, 'multibrot-4');
  assert.deepEqual(state.view, home('multibrot-4'), 'a type without a view opens its home view');
  state = createExplorer({ place: 'armada' }).getState();
  assert.equal(state.type, 'burning-ship');
  assert.deepEqual(state.view, getPlace('armada').view);
  assert.deepEqual(createExplorer({ view: { cx: 'a' }, hash: 42 }).getState().view, home('mandelbrot'));
});

test('getState hands out copies', () => {
  const explorer = createExplorer();
  const state = explorer.getState();
  state.view.cx = 99;
  state.juliaC.re = 99;
  assert.deepEqual(explorer.getState().view, home('mandelbrot'));
  assert.equal(explorer.getState().juliaC.re, -0.8);
});

test('?demo is Seahorse Valley in a vivid palette, the same every time, and renders a rich picture', () => {
  const state = createDemoExplorer().getState();
  assert.deepEqual(createDemoExplorer().getState(), state);
  assert.equal(state.type, 'mandelbrot');
  assert.deepEqual(state.view, getPlace('seahorse-valley').view);
  assert.equal(state.paletteId, 'neon');
  const [width, height] = [120, 80];
  const values = computeImage(state.fractal, state.view, width, height);
  const inside = values.filter((v) => v === INSIDE).length;
  assert.ok(inside > 0 && inside < values.length / 2);
  const rgba = new Uint8ClampedArray(width * height * 4);
  colorize(values, rgba, { palette: getPalette(state.paletteId), density: state.density, offset: state.offset });
  const colours = new Set();
  for (let i = 0; i < rgba.length; i += 4) colours.add((rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2]);
  assert.ok(colours.size >= 100, `${colours.size} colours`);
});
