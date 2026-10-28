/**
 * The controls drawer: fractal types, palettes with density and offset, the
 * colouring mode, the iteration limit, the Julia picker and constant, famous
 * places, and save / share. It builds its lists from the data modules,
 * reports choices through handlers, and sync() mirrors the explorer state.
 */

import { FRACTAL_TYPES } from './fractals.js';
import { PALETTES, getPalette } from './palettes.js';
import { PLACES } from './places.js';
import { MIN_DENSITY, MAX_DENSITY } from './color.js';
import { translate, pick } from './i18n.js';
import { formatDecimal, formatInteger } from './format.js';
import { byId, createElement, setPressed } from './dom.js';

/** Backing size of a place thumbnail (shown at half size for sharp high-DPI screens). */
const THUMB_WIDTH = 144;
const THUMB_HEIGHT = 96;

/** Decimals of the Julia constant fields. */
const C_DIGITS = 6;

/**
 * @typedef {import('./explorer.js').ExplorerState} State
 * @typedef {Object} DrawerHandlers
 * @property {(id: string) => void} setType
 * @property {(id: string) => void} setPalette
 * @property {(density: number) => void} setDensity
 * @property {(offset: number) => void} setOffset
 * @property {(mode: 'smooth'|'histogram') => void} setColoring
 * @property {(iterations: 'auto'|number) => void} setIterations
 * @property {() => void} togglePicker
 * @property {(re: number, im: number) => void} setJuliaC
 * @property {(id: string) => void} goToPlace
 * @property {() => void} save
 * @property {() => void} share
 */

/**
 * A CSS gradient of a cyclic palette, ending where it starts.
 * @param {import('./palettes.js').Palette} palette
 * @returns {string}
 */
function paletteGradient(palette) {
  const stops = palette.stops.map(([position, color]) => `${color} ${Math.round(position * 100)}%`);
  return `linear-gradient(90deg, ${stops.join(', ')}, ${palette.stops[0][1]} 100%)`;
}

/**
 * Sets text only when it changed, so frequent syncs stay cheap.
 * @param {Element} element
 * @param {string} text
 */
function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

/**
 * Sets an input's value unless the user is editing it.
 * @param {HTMLInputElement} input
 * @param {string} value
 */
function setValue(input, value) {
  if (document.activeElement !== input && input.value !== value) input.value = value;
}

/**
 * A number field's value for a Julia constant part.
 * @param {number} value
 * @returns {string}
 */
function cText(value) {
  return String(Number(value.toFixed(C_DIGITS)));
}

/**
 * Builds the drawer and wires its controls.
 * @param {DrawerHandlers} handlers
 */
export function createDrawer(handlers) {
  const typeButtons = FRACTAL_TYPES.map(() =>
    createElement('button', { className: 'chip', attrs: { type: 'button', 'aria-pressed': 'false' } }),
  );
  const paletteButtons = PALETTES.map((palette) => {
    const button = createElement('button', { className: 'swatch', attrs: { type: 'button', 'aria-pressed': 'false' } });
    button.style.backgroundImage = paletteGradient(palette);
    return button;
  });
  const places = PLACES.map((place) => {
    const canvas = createElement('canvas', {
      className: 'place-thumb',
      attrs: { width: String(THUMB_WIDTH), height: String(THUMB_HEIGHT), 'aria-hidden': 'true' },
    });
    const name = createElement('span', { className: 'place-name' });
    const description = createElement('span', { className: 'place-description' });
    const text = createElement('span', { className: 'place-text' }, [name, description]);
    const button = createElement('button', { className: 'place', attrs: { type: 'button' } }, [canvas, text]);
    return { place, canvas, name, description, button };
  });

  byId('type-list').append(...typeButtons);
  byId('palette-list').append(...paletteButtons);
  byId('place-list').append(...places.map((entry) => createElement('li', {}, [entry.button])));

  const paletteName = byId('palette-name');
  const density = byId('density');
  const densityValue = byId('density-value');
  const offset = byId('offset');
  const offsetValue = byId('offset-value');
  const coloringButtons = [...document.querySelectorAll('[data-coloring]')];
  const iterationButtons = [...document.querySelectorAll('[data-iterations]')];
  const iterations = byId('iterations');
  const iterationsNote = byId('iterations-note');
  const picker = byId('julia-pick');
  const juliaRe = byId('julia-re');
  const juliaIm = byId('julia-im');
  density.min = String(Math.log10(MIN_DENSITY));
  density.max = String(Math.log10(MAX_DENSITY));

  /** @type {State|null} */
  let last = null;

  FRACTAL_TYPES.forEach((type, i) => typeButtons[i].addEventListener('click', () => handlers.setType(type.id)));
  PALETTES.forEach((palette, i) => paletteButtons[i].addEventListener('click', () => handlers.setPalette(palette.id)));
  for (const entry of places) entry.button.addEventListener('click', () => handlers.goToPlace(entry.place.id));
  density.addEventListener('input', () => handlers.setDensity(10 ** Number(density.value)));
  offset.addEventListener('input', () => handlers.setOffset(Number(offset.value)));
  for (const button of coloringButtons) {
    button.addEventListener('click', () => handlers.setColoring(button.dataset.coloring));
  }
  for (const button of iterationButtons) {
    button.addEventListener('click', () => {
      if (button.dataset.iterations === 'auto') handlers.setIterations('auto');
      else if (last && last.iterations === 'auto') handlers.setIterations(last.maxIter);
    });
  }
  iterations.addEventListener('change', () => {
    const value = Number(iterations.value);
    if (iterations.value.trim() !== '' && Number.isFinite(value)) handlers.setIterations(value);
  });
  const changeC = () => {
    const re = Number(juliaRe.value);
    const im = Number(juliaIm.value);
    if (juliaRe.value.trim() !== '' && juliaIm.value.trim() !== '' && Number.isFinite(re) && Number.isFinite(im)) {
      handlers.setJuliaC(re, im);
    }
  };
  juliaRe.addEventListener('change', changeC);
  juliaIm.addEventListener('change', changeC);
  picker.addEventListener('click', () => handlers.togglePicker());
  byId('save-png').addEventListener('click', () => handlers.save());
  byId('share-link').addEventListener('click', () => handlers.share());

  return {
    /** The place thumbnails' canvases, for thumbnails.js. */
    places: places.map(({ place, canvas }) => ({ place, canvas })),

    /**
     * Mirrors the explorer state in the controls.
     * @param {State} state
     * @param {{lang: string, picking: boolean}} options
     */
    sync(state, { lang, picking }) {
      last = state;
      FRACTAL_TYPES.forEach((type, i) => setPressed(typeButtons[i], type.id === state.type));
      PALETTES.forEach((palette, i) => setPressed(paletteButtons[i], palette.id === state.paletteId));
      const palette = getPalette(state.paletteId);
      if (palette) setText(paletteName, pick(lang, palette.name));
      setValue(density, String(Math.log10(state.density)));
      setText(densityValue, formatDecimal(state.density, 2, lang));
      setValue(offset, String(state.offset));
      setText(offsetValue, formatDecimal(state.offset, 2, lang));
      for (const button of coloringButtons) setPressed(button, button.dataset.coloring === state.coloring);
      const auto = state.iterations === 'auto';
      for (const button of iterationButtons) setPressed(button, (button.dataset.iterations === 'auto') === auto);
      iterations.disabled = auto;
      setValue(iterations, String(state.maxIter));
      const note = auto ? 'iterations.autoNote' : 'iterations.manualNote';
      setText(iterationsNote, translate(lang, note, { count: formatInteger(state.maxIter, lang) }));
      setPressed(picker, picking);
      setValue(juliaRe, cText(state.juliaC.re));
      setValue(juliaIm, cText(state.juliaC.im));
    },

    /**
     * Writes the names that come with the data in a language.
     * @param {string} lang
     */
    relabel(lang) {
      FRACTAL_TYPES.forEach((type, i) => setText(typeButtons[i], pick(lang, type.label)));
      PALETTES.forEach((palette, i) => {
        const name = pick(lang, palette.name);
        paletteButtons[i].setAttribute('aria-label', name);
        paletteButtons[i].title = name;
      });
      for (const entry of places) {
        setText(entry.name, pick(lang, entry.place.name));
        setText(entry.description, pick(lang, entry.place.description));
      }
    },
  };
}
