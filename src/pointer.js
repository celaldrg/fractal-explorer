/**
 * Mouse, touch and pen input on the fractal canvas, turned into explorer
 * actions: drag pans, the wheel and a pinch zoom around the pointer, a
 * double-click or double-tap zooms in, Shift-drag draws a zoom box, and while
 * the Julia picker is on, hovering or dragging previews and a click or lift picks.
 */

import { wheelZoomFactor, pinchStep, isTap, createTapDetector, ZOOM_STEP, TAP_MAX_MOVE } from './input.js';

/** Wheel events closer together than this (ms) form one step for the Back button. */
const WHEEL_GESTURE_GAP = 250;

/** Smallest side of a zoom box in CSS pixels; smaller boxes are slips and dropped. */
const MIN_BOX_SIDE = 8;

/** A double-click this soon (ms) after a pick is the pick's own second click. */
const PICK_SETTLE_TIME = 600;

/**
 * @typedef {{x: number, y: number}} Point CSS pixels from the canvas corner
 * @typedef {{x0: number, y0: number, x1: number, y1: number}} Box
 * @typedef {{start: Point, last: Point, time: number}} Press
 * @typedef {Object} PointerActions
 * @property {() => void} begin a gesture starts
 * @property {(dx: number, dy: number) => void} pan drags the picture by CSS pixels
 * @property {(x: number, y: number, factor: number, record: boolean) => void} zoomAt
 * @property {(box: Box) => void} zoomBox
 * @property {(box: Box|null) => void} showBox draws or hides the zoom box outline
 * @property {() => boolean} picking whether the Julia picker is on
 * @property {(x: number, y: number) => void} preview shows the Julia set of a point
 * @property {(x: number, y: number) => void} pick opens the Julia set of a point
 */

/**
 * @param {Point} start
 * @param {Point} end
 * @returns {Box}
 */
function boxBetween(start, end) {
  return { x0: start.x, y0: start.y, x1: end.x, y1: end.y };
}

/**
 * Wires pointer, wheel and double-click handlers to the canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {PointerActions} actions
 */
export function attachPointerControls(canvas, actions) {
  /** @type {Map<number, Press>} */
  const presses = new Map();
  const taps = createTapDetector();
  /** @type {'idle'|'press'|'drag'|'pinch'|'box'|'pick'} */
  let mode = 'idle';
  let pinchRecorded = false;
  let lastWheel = Number.NEGATIVE_INFINITY;
  let lastPick = Number.NEGATIVE_INFINITY;
  let lastPointerType = 'mouse';

  /**
   * @param {MouseEvent} event
   * @returns {Point}
   */
  function pointOf(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  /** @param {typeof mode} next */
  function setMode(next) {
    mode = next;
    canvas.dataset.gesture = next;
  }

  /**
   * @param {PointerEvent} event
   * @param {Point} point
   */
  function startPress(event, point) {
    if (presses.size === 2) {
      if (mode === 'box') actions.showBox(null);
      pinchRecorded = false;
      setMode('pinch');
    } else if (presses.size === 1) {
      if (event.shiftKey) setMode('box');
      else if (actions.picking()) {
        setMode('pick');
        actions.preview(point.x, point.y);
      } else setMode('press');
    }
  }

  /** @param {PointerEvent} event */
  function onDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    lastPointerType = event.pointerType;
    canvas.setPointerCapture(event.pointerId);
    actions.begin();
    const point = pointOf(event);
    presses.set(event.pointerId, { start: point, last: point, time: event.timeStamp });
    startPress(event, point);
  }

  /**
   * @param {Press} press
   * @param {Point} point
   */
  function movePinch(press, point) {
    const [first, second] = [...presses.values()];
    const before = [first.last, second.last];
    press.last = point;
    const step = pinchStep(before[0], before[1], first.last, second.last);
    actions.zoomAt(step.x, step.y, step.factor, !pinchRecorded);
    pinchRecorded = true;
    actions.pan(step.dx, step.dy);
  }

  /**
   * @param {Press} press
   * @param {Point} point
   */
  function movePress(press, point) {
    if (Math.hypot(point.x - press.start.x, point.y - press.start.y) <= TAP_MAX_MOVE) return;
    setMode('drag');
    actions.pan(point.x - press.last.x, point.y - press.last.y);
    press.last = point;
  }

  /** @param {PointerEvent} event */
  function onMove(event) {
    const point = pointOf(event);
    const press = presses.get(event.pointerId);
    if (!press) {
      if (event.pointerType === 'mouse' && actions.picking()) actions.preview(point.x, point.y);
      return;
    }
    if (mode === 'pinch' && presses.size === 2) movePinch(press, point);
    else if (mode === 'press') movePress(press, point);
    else {
      const from = press.last;
      press.last = point;
      if (mode === 'drag') actions.pan(point.x - from.x, point.y - from.y);
      else if (mode === 'box') actions.showBox(boxBetween(press.start, point));
      else if (mode === 'pick') actions.preview(point.x, point.y);
    }
  }

  /**
   * Ends a single-pointer gesture at `point`.
   * @param {PointerEvent} event
   * @param {Press} press
   * @param {Point} point
   */
  function finishPress(event, press, point) {
    if (mode === 'press') {
      const tapped = isTap({ ...press.start, time: press.time }, { ...point, time: event.timeStamp });
      if (tapped && event.pointerType !== 'mouse' && taps.tap({ ...point, time: event.timeStamp })) {
        actions.zoomAt(point.x, point.y, ZOOM_STEP, true);
      }
    } else if (mode === 'box') {
      actions.showBox(null);
      const wide = Math.abs(point.x - press.start.x) >= MIN_BOX_SIDE;
      const tall = Math.abs(point.y - press.start.y) >= MIN_BOX_SIDE;
      if (wide && tall) actions.zoomBox(boxBetween(press.start, point));
    } else if (mode === 'pick') {
      lastPick = event.timeStamp;
      actions.pick(point.x, point.y);
    }
  }

  /** @param {PointerEvent} event */
  function onUp(event) {
    const press = presses.get(event.pointerId);
    if (!press) return;
    presses.delete(event.pointerId);
    if (presses.size === 0) {
      finishPress(event, press, pointOf(event));
      setMode('idle');
    } else if (mode === 'pinch' && presses.size === 1) {
      setMode('drag');
    }
  }

  /** @param {PointerEvent} event */
  function onCancel(event) {
    if (!presses.delete(event.pointerId)) return;
    if (mode === 'box') actions.showBox(null);
    taps.reset();
    if (presses.size === 0) setMode('idle');
    else if (presses.size === 1) setMode('drag');
  }

  /** @param {WheelEvent} event */
  function onWheel(event) {
    event.preventDefault();
    actions.begin();
    const point = pointOf(event);
    const record = event.timeStamp - lastWheel > WHEEL_GESTURE_GAP;
    lastWheel = event.timeStamp;
    actions.zoomAt(point.x, point.y, wheelZoomFactor(event, canvas.clientHeight), record);
  }

  /** @param {MouseEvent} event */
  function onDoubleClick(event) {
    event.preventDefault();
    if (lastPointerType !== 'mouse' || event.timeStamp - lastPick < PICK_SETTLE_TIME) return;
    const point = pointOf(event);
    actions.zoomAt(point.x, point.y, ZOOM_STEP, true);
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('dblclick', onDoubleClick);
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  setMode('idle');
}
