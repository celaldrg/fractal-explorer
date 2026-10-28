import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLACES, getPlace } from '../src/places.js';
import { getFractalType, createKernel, autoMaxIter, INSIDE } from '../src/fractals.js';
import { normalizeView, zoomFactor } from '../src/view.js';
import { computeImage } from '../src/render.js';

test('the famous places are there: four Mandelbrot sights and at least three Julia sets', () => {
  for (const id of ['seahorse-valley', 'elephant-valley', 'spiral', 'mini-mandelbrot']) {
    assert.equal(getPlace(id)?.type, 'mandelbrot', id);
  }
  assert.ok(PLACES.filter((place) => place.type === 'julia').length >= 3);
  assert.equal(new Set(PLACES.map((place) => place.id)).size, PLACES.length);
  assert.equal(getPlace('nope'), null);
});

test('every place has a valid type, view and constant, and text in English and Turkish', () => {
  for (const place of PLACES) {
    assert.ok(getFractalType(place.type), place.id);
    assert.deepEqual(normalizeView(place.view), place.view, `${place.id}: view within limits`);
    if (place.type === 'julia') {
      assert.ok(Number.isFinite(place.c.re) && Number.isFinite(place.c.im), place.id);
    } else {
      assert.equal(place.c, null, place.id);
    }
    for (const field of [place.name, place.description]) {
      assert.ok(field.en.trim() && field.tr.trim(), place.id);
    }
    assert.ok(place.description.en.length <= 140 && place.description.tr.length <= 140, `${place.id}: short`);
    assert.notEqual(place.description.en, place.description.tr, `${place.id}: translated`);
  }
});

test('every place shows structure: many colour bands in a small render', () => {
  for (const place of PLACES) {
    const type = getFractalType(place.type);
    const maxIter = autoMaxIter(zoomFactor(place.view, type.home));
    const fractal = { type: place.type, maxIter, cRe: place.c?.re ?? 0, cIm: place.c?.im ?? 0 };
    const values = computeImage(fractal, place.view, 48, 32);
    const bands = new Set([...values].filter((v) => v !== INSIDE).map(Math.floor));
    assert.ok(bands.size >= 8, `${place.id}: ${bands.size} bands`);
  }
});

test('the mini Mandelbrot sits in the middle of its view', () => {
  const { view } = getPlace('mini-mandelbrot');
  assert.equal(createKernel({ type: 'mandelbrot', maxIter: 2000 })(view.cx, view.cy), INSIDE);
});
