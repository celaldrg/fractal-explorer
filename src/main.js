/**
 * Entry point. Builds the explorer, wires the page (header, toolbar, drawer,
 * info bar, messages, canvas input) to it, and keeps the canvas, the URL hash
 * and the saved preferences in step with the explorer state.
 */

import { createExplorer, createDemoExplorer } from './explorer.js';
import { sanitizeSettings } from './settings.js';
import { DEFAULT_LANGUAGE, normalizeLanguage, otherLanguage, translate } from './i18n.js';
import { readStored, writeStored } from './storage.js';
import { canvasRatio } from './display.js';
import { pixelSize } from './view.js';
import { keyCommand, panOffset, ZOOM_STEP } from './input.js';
import { formatComplex, formatZoom, formatInteger, formatDuration, percentOf } from './format.js';
import { byId, translateTree, setPressed } from './dom.js';
import { createRenderer } from './renderer.js';
import { attachPointerControls } from './pointer.js';
import { createDrawer } from './drawer.js';
import { createPreview } from './preview.js';
import { createThumbnails } from './thumbnails.js';

/** Quiet time (ms) before the URL hash and the preferences are written. */
const SAVE_DELAY = 300;
const TOAST_TIME = 2400;
const HINT_TIME = 6000;
const WIDE_LAYOUT = '(min-width: 1024px)';
const SHEET_LAYOUT = '(max-width: 700px)';
const TYPING_TAGS = new Set(['INPUT', 'SELECT', 'TEXTAREA']);

const demo = new URLSearchParams(location.search).has('demo');

const canvas = byId('view');
const drawerPanel = byId('drawer');
const controlsButton = byId('controls');
const backButton = byId('back');
const juliaButton = byId('julia');
const progress = byId('progress');
const progressBar = byId('progress-bar');
const zoomBox = byId('zoom-box');
const notice = byId('notice');
const toastBox = byId('toast');
const info = {
  center: byId('info-center'),
  zoom: byId('info-zoom'),
  iterations: byId('info-iterations'),
  time: byId('info-time'),
};

const explorer = demo
  ? createDemoExplorer()
  : createExplorer({ ...sanitizeSettings(readStored('prefs', null)), hash: location.hash });
let lang = demo ? DEFAULT_LANGUAGE : normalizeLanguage(readStored('lang', DEFAULT_LANGUAGE));
let current = explorer.getState();
/** The ?demo frame renders on this thread so it is complete at once; input ends that. */
let syncFrames = demo;
let picking = false;
let status = { done: false, percent: 0, ms: 0 };
let renderedKey = '';
let coloredKey = '';
let thumbnailKey = '';
let updateQueued = false;
let saveTimer = 0;
/** @type {{key: string, hint: boolean, timer: number}|null} */
let toast = null;

const t = (key, params) => translate(lang, key, params);

const renderer = createRenderer(canvas, {
  onProgress(fraction) {
    status = { done: false, percent: percentOf(fraction), ms: 0 };
    showStatus();
  },
  onComplete(ms) {
    status = { done: true, percent: 100, ms };
    showStatus();
    document.documentElement.dataset.ready = 'true';
  },
});
const preview = createPreview(byId('preview'), byId('preview-canvas'), byId('preview-c'));

/** Canvas pixels per CSS pixel of the canvas as it is now. */
function canvasScale() {
  return renderer.size().width / Math.max(1, canvas.clientWidth);
}

function showStatus() {
  progress.hidden = status.done;
  progressBar.style.transform = `scaleX(${status.percent / 100})`;
  info.time.textContent = status.done ? formatDuration(status.ms, lang) : t('info.rendering', { percent: status.percent });
}

/** @param {import('./explorer.js').ExplorerState} state */
function showInfo(state) {
  const { width, height } = renderer.size();
  info.center.textContent = formatComplex(state.view.cx, state.view.cy, pixelSize(state.view, width, height));
  info.zoom.textContent = formatZoom(state.zoom, lang);
  info.iterations.textContent = formatInteger(state.maxIter, lang);
  showStatus();
}

/** @param {import('./explorer.js').ExplorerState} state */
function drawState(state) {
  if (state.renderKey !== renderedKey) {
    renderer.render(state, syncFrames);
    renderedKey = state.renderKey;
    coloredKey = state.colorKey;
  } else if (state.colorKey !== coloredKey) {
    renderer.recolor(state);
    coloredKey = state.colorKey;
  }
  if (state.colorKey !== thumbnailKey) {
    thumbnails.recolor(state);
    thumbnailKey = state.colorKey;
  }
}

function update() {
  updateQueued = false;
  const cssWidth = canvas.clientWidth;
  const cssHeight = canvas.clientHeight;
  if (renderer.resize(cssWidth, cssHeight, canvasRatio(window.devicePixelRatio, cssWidth, cssHeight))) {
    renderedKey = '';
  }
  current = explorer.getState();
  if (picking && current.type === 'julia') picking = false;
  drawState(current);
  drawer.sync(current, { lang, picking });
  document.body.classList.toggle('picking', picking);
  preview.setVisible(picking);
  backButton.disabled = !current.canGoBack;
  setPressed(juliaButton, current.type === 'julia');
  notice.hidden = !current.precisionLimited;
  showInfo(current);
  scheduleSave();
}

function requestUpdate() {
  if (updateQueued) return;
  updateQueued = true;
  requestAnimationFrame(update);
}

function scheduleSave() {
  if (demo) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const hash = explorer.toHash();
    if (location.hash !== hash) history.replaceState(null, '', hash);
    const { paletteId, density, offset, coloring, iterations } = explorer.getState();
    writeStored('prefs', { paletteId, density, offset, coloring, iterations });
  }, SAVE_DELAY);
}

function hideToast() {
  if (toast) clearTimeout(toast.timer);
  toast = null;
  toastBox.classList.remove('visible');
}

/**
 * @param {string} key message key
 * @param {{hint?: boolean, time?: number}} [options]
 */
function showToast(key, { hint = false, time = TOAST_TIME } = {}) {
  hideToast();
  toastBox.textContent = t(key);
  toastBox.classList.add('visible');
  toast = { key, hint, timer: setTimeout(hideToast, time) };
}

/** The user did something: the first-visit hint goes, and frames render progressively. */
function interacted() {
  syncFrames = false;
  if (toast?.hint) hideToast();
}

/** Runs an explorer change from a control and redraws. */
function act(change) {
  return (...args) => {
    interacted();
    change(...args);
    requestUpdate();
  };
}

/** @param {boolean} open */
function setDrawer(open) {
  document.body.classList.toggle('drawer-open', open);
  drawerPanel.inert = !open;
  controlsButton.setAttribute('aria-expanded', String(open));
}

const sheetLayout = () => window.matchMedia(SHEET_LAYOUT).matches;

/**
 * Turns the Julia picker on or off. It picks on the Mandelbrot set, so it switches there first.
 * @param {boolean} on
 */
function setPicking(on) {
  picking = on;
  preview.setVisible(on);
  if (on) {
    if (explorer.getState().type === 'julia') explorer.toggleJulia();
    if (explorer.getState().type !== 'mandelbrot') explorer.setType('mandelbrot');
    if (sheetLayout()) setDrawer(false);
    const { width, height } = renderer.size();
    preview.show(explorer.juliaPreview(width / 2, height / 2, width, height), current);
  }
  requestUpdate();
}

function toggleJulia() {
  picking = false;
  explorer.toggleJulia();
}

/** @param {number} factor */
function zoomCenter(factor) {
  const { width, height } = renderer.size();
  explorer.zoomAt(width / 2, height / 2, factor, width, height);
}

function savePng() {
  renderer.whenDone(() => {
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `fractal-${current.type}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('toast.saved');
    }, 'image/png');
  });
}

async function shareLink() {
  const hash = explorer.toHash();
  history.replaceState(null, '', `${location.pathname}${hash}`);
  try {
    await navigator.clipboard.writeText(`${location.origin}${location.pathname}${hash}`);
    showToast('toast.copied');
  } catch {
    showToast('toast.copyFailed');
  }
}

/**
 * Runs a keyboard command.
 * @param {string} command from keyCommand()
 * @returns {boolean} false when the key was not used
 */
function runCommand(command) {
  const { width, height } = renderer.size();
  const offset = panOffset(command, width, height);
  if (command === 'escape') {
    if (picking) setPicking(false);
    else if (sheetLayout() && document.body.classList.contains('drawer-open')) setDrawer(false);
    else return false;
    return true;
  }
  interacted();
  if (offset) explorer.pan(offset.dx, offset.dy, width, height);
  else if (command === 'zoom-in') zoomCenter(ZOOM_STEP);
  else if (command === 'zoom-out') zoomCenter(1 / ZOOM_STEP);
  else if (command === 'reset') explorer.reset();
  else if (command === 'julia') toggleJulia();
  else if (command === 'back') explorer.back();
  requestUpdate();
  return true;
}

/** @param {{x0: number, y0: number, x1: number, y1: number}|null} box CSS pixels */
function showZoomBox(box) {
  zoomBox.hidden = !box;
  if (!box) return;
  zoomBox.style.left = `${Math.min(box.x0, box.x1)}px`;
  zoomBox.style.top = `${Math.min(box.y0, box.y1)}px`;
  zoomBox.style.width = `${Math.abs(box.x1 - box.x0)}px`;
  zoomBox.style.height = `${Math.abs(box.y1 - box.y0)}px`;
}

function applyLanguage() {
  document.documentElement.lang = lang;
  document.title = t('app.title');
  translateTree(document.body, t);
  drawer.relabel(lang);
  if (toast) toastBox.textContent = t(toast.key);
}

const drawer = createDrawer({
  setType: act((id) => {
    picking = false;
    explorer.setType(id);
  }),
  setPalette: act((id) => explorer.setPalette(id)),
  setDensity: act((value) => explorer.setDensity(value)),
  setOffset: act((value) => explorer.setOffset(value)),
  setColoring: act((mode) => explorer.setColoring(mode)),
  setIterations: act((value) => explorer.setIterations(value)),
  togglePicker: () => {
    interacted();
    setPicking(!picking);
  },
  setJuliaC: act((re, im) => {
    explorer.setJuliaC(re, im);
    if (explorer.getState().type !== 'julia') explorer.setType('julia');
  }),
  goToPlace: act((id) => {
    picking = false;
    explorer.goToPlace(id);
    if (sheetLayout()) setDrawer(false);
  }),
  save: savePng,
  share: shareLink,
});
const thumbnails = createThumbnails(drawer.places);

attachPointerControls(canvas, {
  begin: interacted,
  pan(dx, dy) {
    const scale = canvasScale();
    const { width, height } = renderer.size();
    explorer.pan(dx * scale, dy * scale, width, height);
    requestUpdate();
  },
  zoomAt(x, y, factor, record) {
    const scale = canvasScale();
    const { width, height } = renderer.size();
    explorer.zoomAt(x * scale, y * scale, factor, width, height, record);
    requestUpdate();
  },
  zoomBox(box) {
    const scale = canvasScale();
    const { width, height } = renderer.size();
    explorer.zoomBox(box.x0 * scale, box.y0 * scale, box.x1 * scale, box.y1 * scale, width, height);
    requestUpdate();
  },
  showBox: showZoomBox,
  picking: () => picking,
  preview(x, y) {
    const scale = canvasScale();
    const { width, height } = renderer.size();
    preview.show(explorer.juliaPreview(x * scale, y * scale, width, height), current);
  },
  pick(x, y) {
    const scale = canvasScale();
    const { width, height } = renderer.size();
    if (explorer.pickJulia(x * scale, y * scale, width, height)) setPicking(false);
  },
});

byId('reset').addEventListener('click', act(() => explorer.reset()));
byId('zoom-in').addEventListener('click', act(() => zoomCenter(ZOOM_STEP)));
byId('zoom-out').addEventListener('click', act(() => zoomCenter(1 / ZOOM_STEP)));
backButton.addEventListener('click', act(() => explorer.back()));
juliaButton.addEventListener('click', act(toggleJulia));
controlsButton.addEventListener('click', () => setDrawer(!document.body.classList.contains('drawer-open')));
byId('preview-close').addEventListener('click', () => setPicking(false));
byId('drawer-close').addEventListener('click', () => setDrawer(false));
byId('lang').addEventListener('click', () => {
  lang = otherLanguage(lang);
  writeStored('lang', lang);
  applyLanguage();
  requestUpdate();
});

window.addEventListener('keydown', (event) => {
  const target = /** @type {HTMLElement} */ (event.target);
  if (TYPING_TAGS.has(target.tagName) || target.isContentEditable) return;
  const command = keyCommand(event);
  if (command && runCommand(command)) event.preventDefault();
});
window.addEventListener('resize', requestUpdate);
new ResizeObserver(requestUpdate).observe(canvas);
window.addEventListener('hashchange', () => {
  if (explorer.applyHash(location.hash)) requestUpdate();
});

applyLanguage();
setDrawer(window.matchMedia(WIDE_LAYOUT).matches);
update();
thumbnails.start(current, demo);
if (!demo && !readStored('hinted', false)) {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  showToast(coarse ? 'hint.touch' : 'hint.mouse', { hint: true, time: HINT_TIME });
  writeStored('hinted', true);
}
