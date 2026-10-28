import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ZOOM_STEP,
  PAN_FRACTION,
  TAP_MAX_MOVE,
  TAP_MAX_TIME,
  DOUBLE_TAP_TIME,
  wheelZoomFactor,
  pinchStep,
  isTap,
  createTapDetector,
  keyCommand,
  panOffset,
} from '../src/input.js';
import { createExplorer } from '../src/explorer.js';
import { pixelToComplex } from '../src/view.js';

const [W, H] = [800, 600];
const close = (a, b, tolerance = 1e-12) => Math.abs(a - b) <= tolerance;

test('wheel: scrolling up zooms in, down zooms out, by the same amount', () => {
  const zoomIn = wheelZoomFactor({ deltaY: -100 }, H);
  const zoomOut = wheelZoomFactor({ deltaY: 100 }, H);
  assert.ok(zoomIn > 1 && zoomOut < 1);
  assert.ok(close(zoomIn * zoomOut, 1));
  assert.equal(wheelZoomFactor({ deltaY: 0 }, H), 1);
});

test('wheel: line and page deltas count as pixels, trackpad pinches zoom faster, steps are capped', () => {
  assert.ok(close(wheelZoomFactor({ deltaY: 3, deltaMode: 1 }, H), wheelZoomFactor({ deltaY: 48 }, H)));
  assert.equal(wheelZoomFactor({ deltaY: 1, deltaMode: 2 }, H), 0.5);
  assert.ok(wheelZoomFactor({ deltaY: -10, ctrlKey: true }, H) > wheelZoomFactor({ deltaY: -10 }, H));
  assert.equal(wheelZoomFactor({ deltaY: -1e6 }, H), 2);
  assert.equal(wheelZoomFactor({ deltaY: 1e6 }, H), 0.5);
  assert.equal(wheelZoomFactor({ deltaY: Number.NEGATIVE_INFINITY }, H), 2);
});

test('pinch: spreading the fingers zooms in around their midpoint', () => {
  const step = pinchStep({ x: 300, y: 300 }, { x: 400, y: 300 }, { x: 250, y: 300 }, { x: 450, y: 300 });
  assert.equal(step.factor, 2);
  assert.deepEqual([step.x, step.y, step.dx, step.dy], [350, 300, 0, 0]);
  const moved = pinchStep({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 30 }, { x: 30, y: 30 });
  assert.deepEqual([moved.factor, moved.dx, moved.dy], [1, 20, 30]);
  assert.equal(pinchStep({ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 1, y: 1 }, { x: 9, y: 9 }).factor, 1, 'no zoom from a zero distance');
});

test('pinch: the point under the fingers stays under the fingers', () => {
  const explorer = createExplorer();
  const [a0, b0, a1, b1] = [{ x: 300, y: 200 }, { x: 420, y: 280 }, { x: 260, y: 150 }, { x: 500, y: 330 }];
  const step = pinchStep(a0, b0, a1, b1);
  const before = pixelToComplex(explorer.getState().view, W, H, step.x, step.y);
  explorer.zoomAt(step.x, step.y, step.factor, W, H);
  explorer.pan(step.dx, step.dy, W, H);
  const after = pixelToComplex(explorer.getState().view, W, H, step.x + step.dx, step.y + step.dy);
  assert.ok(close(after.re, before.re) && close(after.im, before.im));
});

test('taps are short and still; a second tap nearby soon after makes a double tap', () => {
  assert.equal(isTap({ x: 10, y: 10, time: 0 }, { x: 14, y: 13, time: 120 }), true);
  assert.equal(isTap({ x: 10, y: 10, time: 0 }, { x: 10 + TAP_MAX_MOVE + 1, y: 10, time: 50 }), false);
  assert.equal(isTap({ x: 10, y: 10, time: 0 }, { x: 10, y: 10, time: TAP_MAX_TIME + 1 }), false);

  const taps = createTapDetector();
  assert.equal(taps.tap({ x: 100, y: 100, time: 1000 }), false);
  assert.equal(taps.tap({ x: 108, y: 96, time: 1200 }), true);
  assert.equal(taps.tap({ x: 108, y: 96, time: 1300 }), false, 'a third tap starts over');
  assert.equal(taps.tap({ x: 300, y: 96, time: 1400 }), false, 'too far away');
  assert.equal(taps.tap({ x: 300, y: 96, time: 1400 + DOUBLE_TAP_TIME + 1 }), false, 'too late');
  taps.reset();
  assert.equal(taps.tap({ x: 300, y: 96, time: 1800 }), false);
});

test('keys map to commands; modified presses and unknown keys do nothing', () => {
  const expected = {
    ArrowLeft: 'pan-left',
    ArrowRight: 'pan-right',
    ArrowUp: 'pan-up',
    ArrowDown: 'pan-down',
    '+': 'zoom-in',
    '=': 'zoom-in',
    '-': 'zoom-out',
    0: 'reset',
    j: 'julia',
    J: 'julia',
    Backspace: 'back',
    Escape: 'escape',
  };
  for (const [key, command] of Object.entries(expected)) assert.equal(keyCommand({ key }), command, key);
  assert.equal(keyCommand({ key: '+', ctrlKey: true }), null);
  assert.equal(keyCommand({ key: '0', metaKey: true }), null);
  assert.equal(keyCommand({ key: 'q' }), null);
  assert.equal(keyCommand({ key: 'constructor' }), null);
});

test('arrow keys pan by a share of the screen and show more of that side', () => {
  assert.deepEqual(panOffset('pan-left', W, H), { dx: PAN_FRACTION * H, dy: 0 });
  assert.equal(panOffset('zoom-in', W, H), null);
  const explorer = createExplorer();
  const start = explorer.getState().view;
  for (const [command, axis, sign] of [['pan-right', 'cx', 1], ['pan-up', 'cy', 1]]) {
    const { dx, dy } = panOffset(command, W, H);
    const moved = createExplorer();
    moved.pan(dx, dy, W, H);
    assert.equal(Math.sign(moved.getState().view[axis] - start[axis]), sign, command);
  }
  assert.equal(ZOOM_STEP, 2);
});
