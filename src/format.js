/**
 * Text for the info bar and the controls. Pure functions; the language only
 * picks the number style (1,069.5 in English, 1.069,5 in Turkish).
 */

const MINUS = '−';
const NO_VALUE = '–';
const UNDER_A_MILLISECOND = '<1 ms';
const MIN_DIGITS = 2;
const MAX_DIGITS = 16;
const PLAIN_ZOOM_LIMIT = 1e6;

/** @type {Map<string, Intl.NumberFormat>} */
const formatters = new Map();

/**
 * A cached number formatter for a language and a number of fraction digits.
 * @param {string} lang
 * @param {Intl.NumberFormatOptions} options
 * @returns {Intl.NumberFormat}
 */
function numberFormat(lang, options) {
  const locale = lang === 'tr' ? 'tr-TR' : 'en-US';
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = formatters.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, options);
    formatters.set(key, format);
  }
  return format;
}

/**
 * Decimal places a coordinate needs so that neighbouring pixels read differently.
 * @param {number} unit complex length of one pixel
 * @returns {number} between 2 and 16
 */
export function coordinateDigits(unit) {
  if (!(unit > 0) || !Number.isFinite(unit)) return MAX_DIGITS;
  return Math.min(MAX_DIGITS, Math.max(MIN_DIGITS, Math.ceil(-Math.log10(unit)) + 1));
}

/**
 * Fixed-point text of |value| and whether it reads as a negative number (never "−0.00").
 * @param {number} value
 * @param {number} digits
 * @returns {{text: string, negative: boolean}}
 */
function fixedParts(value, digits) {
  const text = Math.abs(value).toFixed(digits);
  return { text, negative: value < 0 && /[1-9]/.test(text) };
}

/**
 * A complex number such as "−0.744200 + 0.130200i", rounded to the pixel size.
 * Coordinates always use a decimal point, as in share links.
 * @param {number} re
 * @param {number} im
 * @param {number} unit complex length of one pixel
 * @returns {string}
 */
export function formatComplex(re, im, unit) {
  const digits = coordinateDigits(unit);
  const real = fixedParts(re, digits);
  const imaginary = fixedParts(im, digits);
  const realText = real.negative ? MINUS + real.text : real.text;
  return `${realText} ${imaginary.negative ? MINUS : '+'} ${imaginary.text}i`;
}

/**
 * A zoom factor such as "×667", "×12,300" or, from a million on, "×2.5e13".
 * @param {number} zoom
 * @param {string} lang
 * @returns {string}
 */
export function formatZoom(zoom, lang) {
  if (zoom < PLAIN_ZOOM_LIMIT) return `×${numberFormat(lang, { maximumSignificantDigits: 3 }).format(zoom)}`;
  const [mantissa, exponent] = zoom.toExponential(1).split('e');
  const digits = numberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `×${digits.format(Number(mantissa))}e${Number(exponent)}`;
}

/**
 * A whole number with the language's digit grouping.
 * @param {number} value
 * @param {string} lang
 * @returns {string}
 */
export function formatInteger(value, lang) {
  return numberFormat(lang, { maximumFractionDigits: 0 }).format(Math.round(value));
}

/**
 * A number with a fixed count of decimals in the language's style.
 * @param {number} value
 * @param {number} digits
 * @param {string} lang
 * @returns {string}
 */
export function formatDecimal(value, digits, lang) {
  return numberFormat(lang, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

/**
 * A render time: "312 ms" below a second, "1.4 s" above, and "<1 ms" when it
 * rounds to nothing (browsers with coarse or frozen timers report 0 ms). A dash
 * stands for a missing or impossible measurement.
 * @param {number} ms
 * @param {string} lang
 * @returns {string}
 */
export function formatDuration(ms, lang) {
  if (!(ms >= 0)) return NO_VALUE;
  if (ms < 0.5) return UNDER_A_MILLISECOND;
  return ms < 1000 ? `${formatInteger(ms, lang)} ms` : `${formatDecimal(ms / 1000, 1, lang)} s`;
}

/**
 * Whole percent of a 0..1 share, rounded down so 100 means really done.
 * @param {number} fraction
 * @returns {number}
 */
export function percentOf(fraction) {
  return Math.min(100, Math.max(0, Math.floor(fraction * 100)));
}
